// Package service: AnnotationService 段落想法（批注）服务
//
// 与帖子底部评论区分：想法围绕原文段落/选区锚定，支持公开与私密、一级回复、
// 点赞、编辑、删除，以及作者编辑原文后的锚点重定位。可见性过滤在服务端完成，
// 私密想法绝不下发给无权用户（对齐 PRD 6.5/6.7 与验收标准 3/9）。
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/anchor"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/digest"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// AnnotationService 段落想法服务
type AnnotationService struct{}

// AnnotationError 想法业务错误
type AnnotationError struct {
	Msg  string
	Code int
}

func (e *AnnotationError) Error() string { return e.Msg }

var (
	ErrAnnotationNotFound      = &AnnotationError{Msg: "想法不存在", Code: 404}
	ErrAnnotationForbidden     = &AnnotationError{Msg: "无权操作他人的想法", Code: 403}
	ErrAnnotationInvalidInput  = &AnnotationError{Msg: "输入不合法", Code: 400}
	ErrAnnotationReplyClosed   = &AnnotationError{Msg: "该想法不可回复", Code: 400}
	ErrAnnotationReplyNotFound = &AnnotationError{Msg: "回复不存在", Code: 404}
)

// annotationReplyPreviewLimit 每条想法初始加载的回复条数
const annotationReplyPreviewLimit = 3

// annotationListCap 列表单次返回上限，避免热门帖子拉取过多
const annotationListCap = 500

// bodyDigest 返回正文归一化后的 sha256 摘要，用于幂等去重。
func bodyDigest(body string) string {
	s := strings.TrimSpace(body)
	if s == "" {
		return ""
	}
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// loadPostForAnnotation 加载帖子并做可见性校验（草稿仅作者可见）。
func loadPostForAnnotation(ctx context.Context, postID, currentUserID string) (*model.Post, error) {
	var post model.Post
	if err := dal.DB.WithContext(ctx).
		Select("id", "status", "author_id", "content", "content_digest").
		First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		return nil, err
	}
	if post.Status == "draft" && post.AuthorID != currentUserID {
		return nil, ErrPostNotFound_Post
	}
	return &post, nil
}

// postContentDigest 取帖子内容摘要，空则按当前内容计算。
func postContentDigest(post *model.Post) string {
	if post.ContentDigest != "" {
		return post.ContentDigest
	}
	return digest.NormHash("post-content", post.Content)
}

// CreateAnnotation 创建段落想法
func (s *AnnotationService) CreateAnnotation(ctx context.Context, postID, userID string, req types.CreateAnnotationReq) (*types.Annotation, error) {
	// 校验选区范围
	if req.Scope == model.AnnotationScopeSelection && req.EndOffset <= req.StartOffset {
		return nil, ErrAnnotationInvalidInput
	}
	if req.Visibility == "" {
		req.Visibility = model.AnnotationVisibilityPublic
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		return nil, ErrAnnotationInvalidInput
	}

	post, err := loadPostForAnnotation(ctx, postID, userID)
	if err != nil {
		return nil, err
	}

	bd := bodyDigest(body)

	// 幂等防重复提交：同一用户在同一位置发表相同正文的活跃想法，返回已有记录
	var existing model.Annotation
	if err := dal.DB.WithContext(ctx).
		Where("post_id = ? AND user_id = ? AND scope = ? AND anchor = ? AND start_offset = ? AND end_offset = ? AND body_digest = ? AND status = ?",
			postID, userID, req.Scope, req.Anchor, req.StartOffset, req.EndOffset, bd, model.AnnotationStatusActive).
		First(&existing).Error; err == nil {
		if err := dal.DB.WithContext(ctx).Preload("User").First(&existing, "id = ?", existing.ID).Error; err != nil {
			return nil, err
		}
		dto := mapper.AnnotationToDTO(&existing, false, false, []types.AnnotationReply{})
		return &dto, nil
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	created := &model.Annotation{
		PostID:            postID,
		UserID:            userID,
		Scope:             req.Scope,
		Anchor:            req.Anchor,
		StartOffset:       req.StartOffset,
		EndOffset:         req.EndOffset,
		SelectedText:      req.SelectedText,
		Prefix:            req.Prefix,
		Suffix:            req.Suffix,
		ParagraphSnapshot: req.ParagraphSnapshot,
		ContentDigest:     postContentDigest(post),
		Body:              body,
		BodyDigest:        bd,
		Visibility:        req.Visibility,
		AnchorStatus:      model.AnnotationAnchorAttached,
		Status:            model.AnnotationStatusActive,
	}
	if err := dal.DB.WithContext(ctx).Create(created).Error; err != nil {
		log.Printf("[Annotation/Create] 创建失败, postID=%s, userID=%s, err=%v", postID, userID, err)
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("User").First(created, "id = ?", created.ID).Error; err != nil {
		return nil, err
	}

	// 想法正文中的 @提及通知
	notification.CreateAnnotationMentionNotifications(ctx, body, userID, postID, created.ID)

	dto := mapper.AnnotationToDTO(created, false, false, []types.AnnotationReply{})
	return &dto, nil
}

// ListAnnotations 获取帖子想法列表（公开 + 本人私密）与各段落公开计数。
// anchor 非空时仅返回该段落的想法；mine 时仅返回本人的公开与私密想法。
func (s *AnnotationService) ListAnnotations(ctx context.Context, postID, currentUserID, anchorParam, sortParam string, mine bool, page, pageSize int) (*types.AnnotationList, error) {
	if _, err := loadPostForAnnotation(ctx, postID, currentUserID); err != nil {
		return nil, err
	}

	blocked := blockedIDList(ctx, currentUserID)
	blockedSet := make(map[string]bool, len(blocked))
	for _, id := range blocked {
		blockedSet[id] = true
	}

	// 段落公开计数（正文数量入口）：仅 active + public，独立于 mine/anchor 过滤
	var countRows []struct {
		Anchor string
		Cnt    int64
	}
	countQuery := dal.DB.WithContext(ctx).Model(&model.Annotation{}).
		Select("anchor, COUNT(*) as cnt").
		Where("post_id = ? AND status = ? AND visibility = ?", postID, model.AnnotationStatusActive, model.AnnotationVisibilityPublic).
		Group("anchor")
	if len(blocked) > 0 {
		countQuery = countQuery.Where("user_id NOT IN ?", blocked)
	}
	countQuery.Scan(&countRows)
	anchorCounts := make([]types.AnnotationAnchorCount, 0, len(countRows))
	for _, r := range countRows {
		anchorCounts = append(anchorCounts, types.AnnotationAnchorCount{Anchor: r.Anchor, Count: int(r.Cnt)})
	}

	// 列表查询：active，或 deleted 且有回复（保留占位）；可见性过滤
	query := dal.DB.WithContext(ctx).Model(&model.Annotation{}).
		Where("post_id = ?", postID).
		Where("status = ? OR (status = ? AND reply_count > 0)", model.AnnotationStatusActive, model.AnnotationStatusDeleted)
	if mine {
		query = query.Where("user_id = ?", currentUserID)
	} else {
		query = query.Where("visibility = ? OR (visibility = ? AND user_id = ?)",
			model.AnnotationVisibilityPublic, model.AnnotationVisibilityPrivate, currentUserID)
	}
	if anchorParam != "" {
		query = query.Where("anchor = ?", anchorParam)
	}
	if len(blocked) > 0 && !mine {
		// 拉黑账号内容默认折叠而非隐藏：仍返回，由 DTO 标记 folded
	}

	var total int64
	query.Count(&total)

	orderClause := "like_count DESC, reply_count DESC, created_at DESC"
	if sortParam == "latest" {
		orderClause = "created_at DESC"
	}

	offset := (page - 1) * pageSize
	if pageSize <= 0 || pageSize > annotationListCap {
		pageSize = annotationListCap
	}
	var rows []model.Annotation
	if err := query.WithContext(ctx).
		Preload("User").
		Order(orderClause).
		Offset(offset).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		log.Printf("[Annotation/List] 查询失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	items := make([]types.Annotation, 0, len(rows))
	if len(rows) == 0 {
		return &types.AnnotationList{Items: items, AnchorCounts: anchorCounts, Total: int(total)}, nil
	}

	ids := make([]string, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}

	// 当前用户已点赞集合
	likedSet := make(map[string]bool)
	if currentUserID != "" {
		var likes []model.AnnotationLike
		dal.DB.WithContext(ctx).Select("annotation_id").
			Where("annotation_id IN ? AND user_id = ?", ids, currentUserID).
			Find(&likes)
		for _, l := range likes {
			likedSet[l.AnnotationID] = true
		}
	}

	// 批量加载回复预览（每条前 annotationReplyPreviewLimit 条，active + deleted 占位）
	var replyRows []model.AnnotationReply
	dal.DB.WithContext(ctx).
		Preload("User").
		Where("annotation_id IN ?", ids).
		Order("annotation_id ASC, created_at ASC").
		Find(&replyRows)
	repliesMap := make(map[string][]types.AnnotationReply)
	for i := range replyRows {
		r := &replyRows[i]
		dto := mapper.AnnotationReplyToDTO(r, blockedSet[r.UserID])
		repliesMap[r.AnnotationID] = append(repliesMap[r.AnnotationID], dto)
	}

	for i := range rows {
		a := &rows[i]
		replies := repliesMap[a.ID]
		if len(replies) > annotationReplyPreviewLimit {
			replies = replies[:annotationReplyPreviewLimit]
		}
		dto := mapper.AnnotationToDTO(a, likedSet[a.ID], blockedSet[a.UserID], replies)
		items = append(items, dto)
	}

	return &types.AnnotationList{Items: items, AnchorCounts: anchorCounts, Total: int(total)}, nil
}

// UpdateAnnotation 编辑自己的想法正文或可见范围
func (s *AnnotationService) UpdateAnnotation(ctx context.Context, postID, annotationID, userID string, req types.UpdateAnnotationReq) (*types.Annotation, error) {
	var a model.Annotation
	if err := dal.DB.WithContext(ctx).
		Where("id = ? AND post_id = ?", annotationID, postID).
		First(&a).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAnnotationNotFound
		}
		return nil, err
	}
	if a.UserID != userID {
		return nil, ErrAnnotationForbidden
	}
	if a.Status != model.AnnotationStatusActive {
		return nil, ErrAnnotationInvalidInput
	}

	updates := map[string]interface{}{}
	if req.Body != nil {
		body := strings.TrimSpace(*req.Body)
		if body == "" || len([]rune(body)) > 1000 {
			return nil, ErrAnnotationInvalidInput
		}
		updates["body"] = body
		updates["body_digest"] = bodyDigest(body)
		updates["edited"] = true
	}
	if req.Visibility != nil {
		if *req.Visibility != model.AnnotationVisibilityPublic && *req.Visibility != model.AnnotationVisibilityPrivate {
			return nil, ErrAnnotationInvalidInput
		}
		updates["visibility"] = *req.Visibility
	}
	if len(updates) == 0 {
		return nil, ErrAnnotationInvalidInput
	}
	if err := dal.DB.WithContext(ctx).Model(&a).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("User").First(&a, "id = ?", annotationID).Error; err != nil {
		return nil, err
	}
	dto := mapper.AnnotationToDTO(&a, false, false, []types.AnnotationReply{})
	return &dto, nil
}

// DeleteAnnotation 删除自己的想法。私密想法立即硬删除；公开想法无回复时硬删除，
// 有回复时软删除保留占位（对齐 PRD 6.5）。
func (s *AnnotationService) DeleteAnnotation(ctx context.Context, postID, annotationID, userID string) error {
	var a model.Annotation
	if err := dal.DB.WithContext(ctx).
		Where("id = ? AND post_id = ?", annotationID, postID).
		First(&a).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrAnnotationNotFound
		}
		return err
	}
	if a.UserID != userID {
		return ErrAnnotationForbidden
	}

	// 私密想法删除后立即对本人不可见；公开且无回复直接移除
	if a.Visibility == model.AnnotationVisibilityPrivate || a.ReplyCount == 0 {
		if err := dal.DB.WithContext(ctx).Where("id = ?", annotationID).Delete(&model.Annotation{}).Error; err != nil {
			return err
		}
		return nil
	}
	// 公开且有回复：软删除保留占位
	if err := dal.DB.WithContext(ctx).Model(&a).Updates(map[string]interface{}{
		"status": model.AnnotationStatusDeleted,
		"body":   "",
	}).Error; err != nil {
		return err
	}
	return nil
}

// CreateReply 回复公开想法（仅一级结构）
func (s *AnnotationService) CreateReply(ctx context.Context, postID, annotationID, userID string, req types.CreateAnnotationReplyReq) (*types.AnnotationReply, error) {
	body := strings.TrimSpace(req.Body)
	if body == "" || len([]rune(body)) > 500 {
		return nil, ErrAnnotationInvalidInput
	}

	var a model.Annotation
	if err := dal.DB.WithContext(ctx).
		Where("id = ? AND post_id = ?", annotationID, postID).
		First(&a).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAnnotationNotFound
		}
		return nil, err
	}
	// 仅公开、活跃想法可回复；私密/删除/审核不可回复
	if a.Visibility != model.AnnotationVisibilityPublic || a.Status != model.AnnotationStatusActive {
		return nil, ErrAnnotationReplyClosed
	}

	reply := &model.AnnotationReply{
		AnnotationID:  annotationID,
		UserID:        userID,
		ReplyToUserID: req.ReplyToUserID,
		Body:          body,
		Status:        model.AnnotationStatusActive,
	}
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(reply).Error; err != nil {
			return err
		}
		return tx.Model(&model.Annotation{}).Where("id = ?", annotationID).
			UpdateColumn("reply_count", gorm.Expr("reply_count + 1")).Error
	})
	if err != nil {
		log.Printf("[Annotation/CreateReply] 创建失败, annotationID=%s, userID=%s, err=%v", annotationID, userID, err)
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("User").First(reply, "id = ?", reply.ID).Error; err != nil {
		return nil, err
	}

	// 回复通知想法作者（自己除外）
	if a.UserID != userID {
		notification.Create(ctx, notification.CreateInput{
			UserID:       a.UserID,
			Type:         "reply",
			ActorID:      userID,
			PostID:       postID,
			AnnotationID: annotationID,
			Content:      truncateContent(body),
		})
	}
	// 回复某条回复时，通知被回复者（与想法作者/自己不同时）
	if req.ReplyToUserID != nil && *req.ReplyToUserID != userID && *req.ReplyToUserID != a.UserID {
		notification.Create(ctx, notification.CreateInput{
			UserID:       *req.ReplyToUserID,
			Type:         "reply",
			ActorID:      userID,
			PostID:       postID,
			AnnotationID: annotationID,
			Content:      truncateContent(body),
		})
	}
	// 回复正文中的 @提及通知
	notification.CreateAnnotationMentionNotifications(ctx, body, userID, postID, annotationID)

	dto := mapper.AnnotationReplyToDTO(reply, false)
	return &dto, nil
}

// ListReplies 分页加载某条想法的回复
func (s *AnnotationService) ListReplies(ctx context.Context, annotationID, currentUserID string, page, pageSize int) (*types.Paginated[types.AnnotationReply], error) {
	blocked := blockedIDList(ctx, currentUserID)
	blockedSet := make(map[string]bool, len(blocked))
	for _, id := range blocked {
		blockedSet[id] = true
	}

	base := dal.DB.WithContext(ctx).Model(&model.AnnotationReply{}).
		Where("annotation_id = ?", annotationID)
	var total int64
	base.Count(&total)

	offset := (page - 1) * pageSize
	var rows []model.AnnotationReply
	q := dal.DB.WithContext(ctx).Preload("User").Where("annotation_id = ?", annotationID)
	q.Order("created_at ASC").Offset(offset).Limit(pageSize).Find(&rows)

	items := make([]types.AnnotationReply, 0, len(rows))
	for i := range rows {
		items = append(items, mapper.AnnotationReplyToDTO(&rows[i], blockedSet[rows[i].UserID]))
	}
	return &types.Paginated[types.AnnotationReply]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// UpdateReply 编辑自己的回复
func (s *AnnotationService) UpdateReply(ctx context.Context, replyID, userID string, body string) (*types.AnnotationReply, error) {
	body = strings.TrimSpace(body)
	if body == "" || len([]rune(body)) > 500 {
		return nil, ErrAnnotationInvalidInput
	}
	var r model.AnnotationReply
	if err := dal.DB.WithContext(ctx).First(&r, "id = ?", replyID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAnnotationReplyNotFound
		}
		return nil, err
	}
	if r.UserID != userID {
		return nil, ErrAnnotationForbidden
	}
	if r.Status != model.AnnotationStatusActive {
		return nil, ErrAnnotationInvalidInput
	}
	if err := dal.DB.WithContext(ctx).Model(&r).Updates(map[string]interface{}{
		"body":   body,
		"edited": true,
	}).Error; err != nil {
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("User").First(&r, "id = ?", replyID).Error; err != nil {
		return nil, err
	}
	dto := mapper.AnnotationReplyToDTO(&r, false)
	return &dto, nil
}

// DeleteReply 删除自己的回复（软删除保留线程上下文，递减想法回复数）
func (s *AnnotationService) DeleteReply(ctx context.Context, replyID, userID string) error {
	var r model.AnnotationReply
	if err := dal.DB.WithContext(ctx).First(&r, "id = ?", replyID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrAnnotationReplyNotFound
		}
		return err
	}
	if r.UserID != userID {
		return nil // 幂等：无权或已删除视为成功
	}
	if r.Status != model.AnnotationStatusActive {
		return nil
	}
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&r).Updates(map[string]interface{}{
			"status": model.AnnotationStatusDeleted,
			"body":   "",
		}).Error; err != nil {
			return err
		}
		return tx.Model(&model.Annotation{}).Where("id = ? AND reply_count > 0", r.AnnotationID).
			UpdateColumn("reply_count", gorm.Expr("reply_count - 1")).Error
	})
	return err
}

// LikeAnnotation 点赞公开想法，返回 (likeCount, alreadyLiked, error)
func (s *AnnotationService) LikeAnnotation(ctx context.Context, annotationID, userID string) (int, bool, error) {
	var a model.Annotation
	if err := dal.DB.WithContext(ctx).Select("id", "user_id", "post_id", "like_count", "visibility", "status").
		First(&a, "id = ?", annotationID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, false, ErrAnnotationNotFound
		}
		return 0, false, err
	}
	if a.Visibility != model.AnnotationVisibilityPublic || a.Status != model.AnnotationStatusActive {
		return 0, false, ErrAnnotationInvalidInput
	}

	var existing model.AnnotationLike
	if err := dal.DB.WithContext(ctx).Where("annotation_id = ? AND user_id = ?", annotationID, userID).First(&existing).Error; err == nil {
		return a.LikeCount, true, nil
	} else if err != gorm.ErrRecordNotFound {
		return 0, false, err
	}

	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&model.AnnotationLike{AnnotationID: annotationID, UserID: userID}).Error; err != nil {
			return err
		}
		return tx.Model(&model.Annotation{}).Where("id = ?", annotationID).
			UpdateColumn("like_count", gorm.Expr("like_count + 1")).Error
	})
	if err != nil {
		if notification.IsUniqueConstraintError(err) {
			var a2 model.Annotation
			dal.DB.WithContext(ctx).Select("like_count").First(&a2, "id = ?", annotationID)
			return a2.LikeCount, true, nil
		}
		return 0, false, err
	}

	// 新点赞通知想法作者（聚合去重：同作者同想法只通知一次）
	if a.UserID != userID {
		notification.Create(ctx, notification.CreateInput{
			UserID:       a.UserID,
			Type:         "like",
			ActorID:      userID,
			PostID:       a.PostID,
			AnnotationID: annotationID,
		})
	}

	var updated model.Annotation
	dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", annotationID)
	return updated.LikeCount, false, nil
}

// UnlikeAnnotation 取消点赞
func (s *AnnotationService) UnlikeAnnotation(ctx context.Context, annotationID, userID string) (int, error) {
	var a model.Annotation
	if err := dal.DB.WithContext(ctx).Select("id", "like_count").First(&a, "id = ?", annotationID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, ErrAnnotationNotFound
		}
		return 0, err
	}
	var rowsAffected int64
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Where("annotation_id = ? AND user_id = ?", annotationID, userID).Delete(&model.AnnotationLike{})
		if result.Error != nil {
			return result.Error
		}
		rowsAffected = result.RowsAffected
		if rowsAffected == 0 {
			return nil
		}
		return tx.Model(&model.Annotation{}).Where("id = ? AND like_count > 0", annotationID).
			UpdateColumn("like_count", gorm.Expr("like_count - 1")).Error
	})
	if err != nil {
		return 0, err
	}
	if rowsAffected == 0 {
		return a.LikeCount, nil
	}
	var updated model.Annotation
	dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", annotationID)
	return updated.LikeCount, nil
}

// ReconcileAnchors 在帖子内容变更后重算该帖想法的锚点状态。
// 归一化内容未变则跳过；否则按 L1->L4 阶梯重定位，无法可靠定位的标记为 orphaned。
// 系统不得静默把想法挂到相似但不确定的段落（对齐 PRD 6.7）。
func (s *AnnotationService) ReconcileAnchors(ctx context.Context, postID, newContent string) error {
	newDigest := digest.NormHash("post-content", newContent)

	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "content_digest").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}
	if post.ContentDigest == newDigest && newDigest != "" {
		return nil // 内容未变，跳过重算
	}

	paras := anchor.ExtractParagraphs(newContent)

	var anns []model.Annotation
	if err := dal.DB.WithContext(ctx).
		Where("post_id = ? AND status = ?", postID, model.AnnotationStatusActive).
		Find(&anns).Error; err != nil {
		return err
	}

	for i := range anns {
		a := &anns[i]
		sel := anchor.Selector{Exact: a.SelectedText, Prefix: a.Prefix, Suffix: a.Suffix}
		_, lvl := anchor.Locate(paras, sel, a.ParagraphSnapshot)
		want := model.AnnotationAnchorAttached
		if lvl == anchor.LevelNone {
			want = model.AnnotationAnchorOrphaned
		}
		if a.AnchorStatus != want {
			dal.DB.WithContext(ctx).Model(&model.Annotation{}).
				Where("id = ?", a.ID).Update("anchor_status", want)
		}
	}

	// 更新帖子内容摘要，供下次跳过
	if post.ContentDigest != newDigest {
		dal.DB.WithContext(ctx).Model(&model.Post{}).
			Where("id = ?", postID).Update("content_digest", newDigest)
	}
	return nil
}
