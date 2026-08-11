package service

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/digest"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/sanction"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// PostService 帖子服务
type PostService struct{}

// PostError 帖子业务错误
type PostError struct {
	Msg  string
	Code int
}

func (e *PostError) Error() string { return e.Msg }

var (
	ErrPostNotFound_Post = &PostError{Msg: "帖子不存在", Code: 404}
	ErrPostForbidden     = &PostError{Msg: "无权操作他人的帖子", Code: 403}
	ErrPostInvalidInput  = &PostError{Msg: "输入不合法", Code: 400}
	ErrPostConflict      = &PostError{Msg: "帖子已被其他会话修改，请刷新后重试", Code: 409}
)

func validChannel(ctx context.Context, ch string) bool {
	if ch == "" {
		return false
	}
	var count int64
	dal.DB.WithContext(ctx).Model(&model.Channel{}).Where("name = ?", ch).Count(&count)
	return count > 0
}

// batchLikedPostIDs 批量查询当前用户对一组帖子的点赞状态
func batchLikedPostIDs(ctx context.Context, postIDs []string, userID string) map[string]bool {
	result := make(map[string]bool)
	if userID == "" || len(postIDs) == 0 {
		return result
	}
	var likes []model.PostLike
	dal.DB.WithContext(ctx).
		Where("user_id = ? AND post_id IN ?", userID, postIDs).
		Select("post_id").
		Find(&likes)
	for _, l := range likes {
		result[l.PostID] = true
	}
	return result
}

// batchBookmarkedPostIDs 批量查询当前用户对一组帖子的收藏状态
func batchBookmarkedPostIDs(ctx context.Context, postIDs []string, userID string) map[string]bool {
	result := make(map[string]bool)
	if userID == "" || len(postIDs) == 0 {
		return result
	}
	var bookmarks []model.Bookmark
	dal.DB.WithContext(ctx).
		Where("user_id = ? AND post_id IN ?", userID, postIDs).
		Select("post_id").
		Find(&bookmarks)
	for _, b := range bookmarks {
		result[b.PostID] = true
	}
	return result
}

// batchCommentCount 批量查询帖子的评论数
func batchCommentCount(ctx context.Context, postIDs []string) map[string]int {
	result := make(map[string]int)
	if len(postIDs) == 0 {
		return result
	}
	type countRow struct {
		PostID string
		Count  int
	}
	var rows []countRow
	dal.DB.WithContext(ctx).
		Model(&model.Comment{}).
		Select("post_id, count(*) as count").
		Where("post_id IN ?", postIDs).
		Group("post_id").
		Find(&rows)
	for _, r := range rows {
		result[r.PostID] = r.Count
	}
	return result
}

// mapPostsToDTOs 批量将帖子 model 转为 DTO（含评论数、点赞、收藏状态）
func mapPostsToDTOs(ctx context.Context, posts []model.Post, userID string) []types.Post {
	postIDs := make([]string, 0, len(posts))
	for _, p := range posts {
		postIDs = append(postIDs, p.ID)
	}
	likedSet := batchLikedPostIDs(ctx, postIDs, userID)
	bookmarkedSet := batchBookmarkedPostIDs(ctx, postIDs, userID)
	commentCounts := batchCommentCount(ctx, postIDs)

	items := make([]types.Post, 0, len(posts))
	for _, p := range posts {
		tagNames := mapper.ExtractTagNames(p.Tags)
		items = append(items, mapper.PostToListDTO(&p, commentCounts[p.ID], likedSet[p.ID], bookmarkedSet[p.ID], tagNames))
	}
	return items
}

// ListPosts 帖子列表
// status: 空或 published=公开列表；draft=仅当前用户自己的草稿
func (s *PostService) ListPosts(ctx context.Context, channel, sortParam, q, tag, status, feed, userID string, page, pageSize int) (*types.Paginated[types.Post], error) {
	// 校验 channel，无效时回退到 general
	if channel != "all" && !validChannel(ctx, channel) {
		channel = "general"
	}

	query := dal.DB.WithContext(ctx).Model(&model.Post{})

	// 状态过滤：草稿仅本人可见，公开列表使用统一可见性作用域
	if status == "draft" {
		if userID == "" {
			return &types.Paginated[types.Post]{Items: []types.Post{}, Total: 0, Page: page, PageSize: pageSize, TotalPages: 0}, nil
		}
		query = query.Where("status = ? AND author_id = ?", "draft", userID)
	} else {
		query = postPublishedScope(ctx, query, userID)
	}

	// 关注动态流：只显示当前用户关注用户的帖子，需登录
	if feed == "following" {
		if userID == "" {
			return &types.Paginated[types.Post]{Items: []types.Post{}, Total: 0, Page: page, PageSize: pageSize, TotalPages: 0}, nil
		}
		query = query.Where("author_id IN (?)",
			dal.DB.Model(&model.Follow{}).Select("following_id").Where("follower_id = ?", userID))
	}

	if q != "" {
		like := "%" + q + "%"
		query = query.Where("title ILIKE ? OR content ILIKE ?", like, like)
	}
	if channel != "" && channel != "all" {
		if !validChannel(ctx, channel) {
			channel = "general"
		}
		query = query.Where("channel = ?", channel)
	}
	if tag != "" {
		query = query.Where("id IN (?)",
			dal.DB.Model(&model.PostTag{}).Select("post_id").Where("tag_id IN (?)",
				dal.DB.Model(&model.Tag{}).Select("id").Where("name = ?", tag)))
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	dbQuery := dal.DB.WithContext(ctx).
		Preload("Author").
		Preload("Tags")

	// 状态过滤同步到 dbQuery
	if status == "draft" {
		dbQuery = dbQuery.Where("status = ? AND author_id = ?", "draft", userID)
	} else {
		dbQuery = postPublishedScope(ctx, dbQuery, userID)
	}

	// 关注动态流同步到 dbQuery
	if feed == "following" {
		if userID == "" {
			return &types.Paginated[types.Post]{Items: []types.Post{}, Total: 0, Page: page, PageSize: pageSize, TotalPages: 0}, nil
		}
		dbQuery = dbQuery.Where("author_id IN (?)",
			dal.DB.Model(&model.Follow{}).Select("following_id").Where("follower_id = ?", userID))
	}

	// 复用相同的 where 条件
	if q != "" {
		like := "%" + q + "%"
		dbQuery = dbQuery.Where("title ILIKE ? OR content ILIKE ?", like, like)
	}
	if channel != "" && channel != "all" {
		dbQuery = dbQuery.Where("channel = ?", channel)
	}
	if tag != "" {
		dbQuery = dbQuery.Where("id IN (?)",
			dal.DB.Model(&model.PostTag{}).Select("post_id").Where("tag_id IN (?)",
				dal.DB.Model(&model.Tag{}).Select("id").Where("name = ?", tag)))
	}

	offset := (page - 1) * pageSize

	var items []types.Post

	if sortParam == "hot" {
		// 热排序：拉取 500 条，内存排序后分页
		var posts []model.Post
		if err := dbQuery.Order("is_pinned DESC, created_at DESC").Limit(500).Find(&posts).Error; err != nil {
			return nil, err
		}

		// 获取评论数用于热排序
		postIDs := make([]string, 0, len(posts))
		for _, p := range posts {
			postIDs = append(postIDs, p.ID)
		}
		commentCounts := batchCommentCount(ctx, postIDs)

		sort.Slice(posts, func(i, j int) bool {
			// 置顶帖永远排在最前
			if posts[i].IsPinned != posts[j].IsPinned {
				return posts[i].IsPinned
			}
			scoreI := posts[i].LikeCount*2 + commentCounts[posts[i].ID]*3
			scoreJ := posts[j].LikeCount*2 + commentCounts[posts[j].ID]*3
			if scoreJ != scoreI {
				return scoreJ < scoreI
			}
			return posts[j].CreatedAt.After(posts[i].CreatedAt)
		})

		start := offset
		end := start + pageSize
		if start > len(posts) {
			start = len(posts)
		}
		if end > len(posts) {
			end = len(posts)
		}
		paged := posts[start:end]
		items = mapPostsToDTOs(ctx, paged, userID)
	} else {
		var posts []model.Post
		if err := dbQuery.Order("is_pinned DESC, created_at DESC").Offset(offset).Limit(pageSize).Find(&posts).Error; err != nil {
			return nil, err
		}
		items = mapPostsToDTOs(ctx, posts, userID)
	}

	return &types.Paginated[types.Post]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// GetPost 帖子详情（浏览量 +1）
func (s *PostService) GetPost(ctx context.Context, postID, userID string) (*types.Post, error) {
	var post model.Post
	if err := dal.DB.WithContext(ctx).
		Preload("Author").
		Preload("Tags").
		First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		return nil, err
	}

	// 草稿仅作者可见，且不增加浏览量
	if post.Status == "draft" {
		if userID == "" || post.AuthorID != userID {
			return nil, ErrPostNotFound_Post
		}
	} else {
		// 已发布帖子浏览量 +1
		if err := dal.DB.WithContext(ctx).Model(&model.Post{}).
			Where("id = ?", postID).
			UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error; err != nil {
			return nil, err
		}
	}

	commentCounts := batchCommentCount(ctx, []string{postID})
	likedSet := batchLikedPostIDs(ctx, []string{postID}, userID)
	bookmarkedSet := batchBookmarkedPostIDs(ctx, []string{postID}, userID)

	tagNames := mapper.ExtractTagNames(post.Tags)
	dto := mapper.PostToDTO(&post, commentCounts[postID], likedSet[postID], bookmarkedSet[postID], tagNames)
	return &dto, nil
}

// RelatedPosts 相关讨论推荐（F14）。
// 匹配策略：同频道优先 + 共享标签加分，排除自身；取 limit 条（默认 5）。
// 只返回已发布且当前用户可见的帖子。
func (s *PostService) RelatedPosts(ctx context.Context, postID, userID string, limit int) ([]types.Post, error) {
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}

	var post model.Post
	if err := dal.DB.WithContext(ctx).
		Select("id", "channel").
		First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		return nil, err
	}

	// 同频道已发布帖子（排除自身），按相似度评分排序后取前 limit 条
	dbQuery := dal.DB.WithContext(ctx).
		Model(&model.Post{}).
		Select(`posts.id,
			CASE WHEN posts.channel = ? THEN 2 ELSE 0 END +
			(SELECT COUNT(*) FROM post_tags pt
			 WHERE pt.post_id = posts.id
			   AND pt.tag_id IN (SELECT pt2.tag_id FROM post_tags pt2 WHERE pt2.post_id = ?)) AS rel_score`,
			post.Channel, postID).
		Where("posts.id <> ?", postID)
	dbQuery = postPublishedScope(ctx, dbQuery, userID)

	var rows []model.Post
	if err := dbQuery.
		Order("rel_score DESC, posts.created_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		log.Printf("[Post/RelatedPosts] 查询相关讨论失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	if len(rows) == 0 {
		return []types.Post{}, nil
	}

	// 批量组装 DTO
	ids := make([]string, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	commentCounts := batchCommentCount(ctx, ids)
	likedSet := batchLikedPostIDs(ctx, ids, userID)
	bookmarkedSet := batchBookmarkedPostIDs(ctx, ids, userID)

	// 预加载作者与标签
	var full []model.Post
	if err := dal.DB.WithContext(ctx).
		Preload("Author").Preload("Tags").
		Where("id IN ?", ids).
		Find(&full).Error; err != nil {
		log.Printf("[Post/RelatedPosts] 预加载相关讨论失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	items := make([]types.Post, 0, len(full))
	for i := range full {
		p := &full[i]
		tagNames := mapper.ExtractTagNames(p.Tags)
		items = append(items, mapper.PostToDTO(p, commentCounts[p.ID], likedSet[p.ID], bookmarkedSet[p.ID], tagNames))
	}
	return items, nil
}

func replacePostTagsTx(tx *gorm.DB, postID string, rawTags []string) error {
	if err := tx.Where("post_id = ?", postID).Delete(&model.PostTag{}).Error; err != nil {
		return err
	}
	seen := make(map[string]bool)
	for _, rawTag := range rawTags {
		tagName := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(rawTag), "#"))
		if tagName == "" || len([]rune(tagName)) > 20 || seen[tagName] {
			continue
		}
		seen[tagName] = true

		var tag model.Tag
		if err := tx.Where("name = ?", tagName).First(&tag).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				tag = model.Tag{Name: tagName}
				if err := tx.Create(&tag).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}
		if err := tx.Create(&model.PostTag{PostID: postID, TagID: tag.ID}).Error; err != nil {
			return err
		}
	}
	return nil
}

// CreatePost 创建帖子（支持 tags）
func (s *PostService) CreatePost(ctx context.Context, userID string, req types.CreatePostReq) (*types.Post, error) {
	if err := sanction.CanWrite(ctx, userID); err != nil {
		return nil, &PostError{Msg: err.Error(), Code: 403}
	}
	if err := validateCreatePostInputPair(req); err != nil {
		return nil, err
	}
	contentDocEnabled := true
	if req.ContentDocEnabled != nil {
		contentDocEnabled = *req.ContentDocEnabled
	}
	editorDowngraded := false
	if req.EditorDowngraded != nil {
		editorDowngraded = *req.EditorDowngraded
	}
	if !contentDocEnabled {
		req.ContentDoc = nil
	}
	channel := "general"
	if req.Channel != nil && validChannel(ctx, *req.Channel) {
		channel = *req.Channel
	}
	contentFormat := "markdown"
	if contentDocEnabled && len(req.ContentDoc) > 0 {
		contentFormat = "richtext"
	}

	var created model.Post
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		status := req.Status
		if status == "" {
			status = "published"
		}
		post := &model.Post{
			Title:             req.Title,
			Content:           req.Content,
			ContentDoc:        append([]byte(nil), req.ContentDoc...),
			ContentFormat:     contentFormat,
			Channel:           channel,
			AuthorID:          userID,
			Status:            status,
			AiSummary:         req.AiSummary,
			Font:              req.Font,
			CoverURL:          req.CoverURL,
			ContentDocEnabled: contentDocEnabled,
			EditorDowngraded:  editorDowngraded,
			ContentDigest:     digest.NormHash("post-content", req.Content),
		}
		if err := tx.Create(post).Error; err != nil {
			log.Printf("[CreatePost] 创建帖子失败, userID=%s, title=%s, err=%v", userID, req.Title, err)
			return err
		}

		// 处理标签
		if len(req.Tags) > 0 {
			seen := make(map[string]bool)
			for _, rawTag := range req.Tags {
				tagName := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(rawTag), "#"))
				if tagName == "" || len([]rune(tagName)) > 20 || seen[tagName] {
					continue
				}
				seen[tagName] = true

				// upsert tag
				var tag model.Tag
				if err := tx.Where("name = ?", tagName).First(&tag).Error; err != nil {
					if err == gorm.ErrRecordNotFound {
						tag = model.Tag{Name: tagName}
						if err := tx.Create(&tag).Error; err != nil {
							log.Printf("[CreatePost] 创建标签失败, tagName=%s, postID=%s, err=%v", tagName, post.ID, err)
							return err
						}
					} else {
						log.Printf("[CreatePost] 查询标签失败, tagName=%s, postID=%s, err=%v", tagName, post.ID, err)
						return err
					}
				}
				// 创建关联
				if err := tx.Create(&model.PostTag{PostID: post.ID, TagID: tag.ID}).Error; err != nil {
					log.Printf("[CreatePost] 创建标签关联失败, postID=%s, tagID=%s, tagName=%s, err=%v", post.ID, tag.ID, tagName, err)
					return err
				}
			}
		}

		// 重新加载带关联的数据
		if err := tx.Preload("Author").Preload("Tags").First(&created, "id = ?", post.ID).Error; err != nil {
			log.Printf("[CreatePost] 重新加载帖子关联数据失败, postID=%s, err=%v", post.ID, err)
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// @提及通知
	notification.CreateMentionNotifications(ctx, req.Content, userID, created.ID)

	tagNames := mapper.ExtractTagNames(created.Tags)
	dto := mapper.PostToDTO(&created, 0, false, false, tagNames)
	return &dto, nil
}

// UpdatePost 更新帖子
func (s *PostService) UpdatePost(ctx context.Context, postID, userID string, req types.UpdatePostReq) (*types.Post, error) {
	if err := validateUpdatePostInputPair(req); err != nil {
		return nil, err
	}
	if req.ContentDoc != nil {
		if err := validatePostContentDoc(*req.ContentDoc); err != nil {
			return nil, err
		}
	}
	var existing model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id", "status", "content_doc_enabled", "editor_downgraded", "content_digest", "updated_at").First(&existing, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		log.Printf("[UpdatePost] 查询帖子失败, postID=%s, err=%v", postID, err)
		return nil, err
	}
	if existing.AuthorID != userID {
		return nil, ErrPostForbidden
	}
	// 13. 乐观锁：客户端期望的更新时间与服务端不一致时返回 409
	if req.ExpectedUpdatedAt != nil && *req.ExpectedUpdatedAt != "" {
		expected, err := time.Parse(time.RFC3339Nano, *req.ExpectedUpdatedAt)
		if err == nil {
			if !existing.UpdatedAt.Equal(expected) {
				return nil, ErrPostConflict
			}
		}
	}

	contentDocEnabledChange := req.ContentDocEnabled != nil
	contentDocEnabledFromReq := contentDocEnabledChange && *req.ContentDocEnabled
	if req.Content != nil {
		docEnabled := existing.ContentDocEnabled
		if contentDocEnabledChange {
			docEnabled = contentDocEnabledFromReq
		}
		if docEnabled && req.ContentDoc == nil {
			return nil, ErrPostInvalidInput
		}
		if !docEnabled {
			req.ContentDoc = nil
		}
	}

	isDraft := existing.Status == "draft" || (req.Status != nil && *req.Status == "draft")
	if req.Title != nil {
		titleLen := len([]rune(*req.Title))
		if titleLen > 100 || (titleLen < 1 && !isDraft) {
			return nil, ErrPostInvalidInput
		}
	}
	if req.Content != nil {
		contentLen := len([]rune(*req.Content))
		if contentLen > 40000 || (contentLen < 1 && !isDraft) {
			return nil, ErrPostInvalidInput
		}
	}

	updates := map[string]interface{}{"edited": true}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Content != nil {
		updates["content"] = *req.Content
		if req.ContentDoc != nil {
			updates["content_doc"] = append([]byte(nil), (*req.ContentDoc)...)
		} else {
			updates["content_doc"] = nil
		}
		updates["content_digest"] = digest.NormHash("post-content", *req.Content)
		// content_format 始终随 content 重算一次，保证与 content_doc_enabled/content_doc 一致
		{
			docEnabled := existing.ContentDocEnabled
			if contentDocEnabledChange {
				docEnabled = contentDocEnabledFromReq
			}
			if docEnabled && req.ContentDoc != nil && len(*req.ContentDoc) > 0 {
				updates["content_format"] = "richtext"
			} else {
				updates["content_format"] = "markdown"
			}
		}
	}
	if contentDocEnabledChange {
		updates["content_doc_enabled"] = *req.ContentDocEnabled
	}
	if req.EditorDowngraded != nil {
		updates["editor_downgraded"] = *req.EditorDowngraded
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.AiSummary != nil {
		updates["ai_summary"] = *req.AiSummary
	}
	if req.Font != nil {
		updates["font"] = *req.Font
	}
	if req.CoverURL != nil {
		updates["cover_url"] = *req.CoverURL
	}
	var updated model.Post
	if err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.Post{}).Where("id = ? AND author_id = ?", postID, userID).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPostForbidden
		}
		if req.Tags != nil {
			if err := replacePostTagsTx(tx, postID, *req.Tags); err != nil {
				return err
			}
		}
		return tx.Preload("Author").Preload("Tags").First(&updated, "id = ?", postID).Error
	}); err != nil {
		log.Printf("[UpdatePost] 原子更新帖子失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	// 内容变更后重算段落想法锚点（无法可靠定位的降级为 orphaned，不静默挂错段落）
	if req.Content != nil {
		(&AnnotationService{}).ReconcileAnchors(ctx, postID, existing.ContentDigest, *req.Content)
	}

	// @提及通知
	if req.Content != nil {
		notification.CreateMentionNotifications(ctx, *req.Content, userID, postID)
	}

	commentCounts := batchCommentCount(ctx, []string{postID})
	likedSet := batchLikedPostIDs(ctx, []string{postID}, userID)
	bookmarkedSet := batchBookmarkedPostIDs(ctx, []string{postID}, userID)

	tagNames := mapper.ExtractTagNames(updated.Tags)
	dto := mapper.PostToDTO(&updated, commentCounts[postID], likedSet[postID], bookmarkedSet[postID], tagNames)
	return &dto, nil
}

// DeletePost 删除帖子
// 使用事务手动清理所有关联数据，避免依赖数据库外键级联约束
// （GORM AutoMigrate 不会更新已存在表的外键约束，可能导致删除被外键阻止）
func (s *PostService) DeletePost(ctx context.Context, postID, userID string) error {
	var existing model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&existing, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrPostNotFound_Post
		}
		log.Printf("[DeletePost] 查询帖子失败, postID=%s, err=%v", postID, err)
		return err
	}
	if existing.AuthorID != userID {
		return ErrPostForbidden
	}

	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return deletePostCascaded(tx, postID)
	})
	if err != nil {
		log.Printf("[DeletePost] 删除帖子事务失败, postID=%s, err=%v", postID, err)
		return err
	}
	return nil
}

// deletePostCascaded 在事务内级联删除帖子及其全部关联数据。
// 复用自 DeletePost 的 10 步清理逻辑，供作者删帖与举报处置共用，
// 避免裸删除产生孤儿数据或触发数据库外键阻塞。
func deletePostCascaded(tx *gorm.DB, postID string) error {
	// 1. 先查出帖子下所有评论 ID，用于删除评论点赞
	var commentIDs []string
	if err := tx.Model(&model.Comment{}).Where("post_id = ?", postID).Pluck("id", &commentIDs).Error; err != nil {
		return fmt.Errorf("查询评论ID失败: %w", err)
	}
	// 2. 删除评论点赞
	if len(commentIDs) > 0 {
		if err := tx.Where("comment_id IN ?", commentIDs).Delete(&model.CommentLike{}).Error; err != nil {
			return fmt.Errorf("删除评论点赞失败: %w", err)
		}
	}
	// 3. 删除评论
	if err := tx.Where("post_id = ?", postID).Delete(&model.Comment{}).Error; err != nil {
		return fmt.Errorf("删除评论失败: %w", err)
	}
	// 4. 删除帖子点赞
	if err := tx.Where("post_id = ?", postID).Delete(&model.PostLike{}).Error; err != nil {
		return fmt.Errorf("删除帖子点赞失败: %w", err)
	}
	// 5. 删除收藏
	if err := tx.Where("post_id = ?", postID).Delete(&model.Bookmark{}).Error; err != nil {
		return fmt.Errorf("删除收藏失败: %w", err)
	}
	// 6. 删除帖子-标签关联
	if err := tx.Where("post_id = ?", postID).Delete(&model.PostTag{}).Error; err != nil {
		return fmt.Errorf("删除标签关联失败: %w", err)
	}
	// 7. 删除帖子摘要
	if err := tx.Where("post_id = ?", postID).Delete(&model.PostSummary{}).Error; err != nil {
		return fmt.Errorf("删除帖子摘要失败: %w", err)
	}
	// 8. 删除讨论摘要
	if err := tx.Where("post_id = ?", postID).Delete(&model.ThreadSummary{}).Error; err != nil {
		return fmt.Errorf("删除讨论摘要失败: %w", err)
	}
	// 9. 通知中的 post_id 置空（SET NULL 语义）
	if err := tx.Model(&model.Notification{}).Where("post_id = ?", postID).Update("post_id", nil).Error; err != nil {
		return fmt.Errorf("清理通知关联失败: %w", err)
	}
	// 10. 通知中的 comment_id 置空（评论随帖子一并删除）
	if len(commentIDs) > 0 {
		if err := tx.Model(&model.Notification{}).Where("comment_id IN ?", commentIDs).Update("comment_id", nil).Error; err != nil {
			return fmt.Errorf("清理评论通知关联失败: %w", err)
		}
	}
	// 11. 最后删除帖子本身
	if err := tx.Delete(&model.Post{}, "id = ?", postID).Error; err != nil {
		return fmt.Errorf("删除帖子失败: %w", err)
	}
	return nil
}

// SetPostStatus 设置帖子置顶/精华状态（管理员/版主操作）
func (s *PostService) SetPostStatus(ctx context.Context, postID string, req types.UpdatePostStatusReq) (*types.Post, error) {
	var existing model.Post
	if err := dal.DB.WithContext(ctx).Select("id").First(&existing, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		log.Printf("[SetPostStatus] 查询帖子失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	if req.IsPinned == nil && req.IsFeatured == nil {
		return nil, ErrPostInvalidInput
	}

	updates := map[string]interface{}{}
	if req.IsPinned != nil {
		updates["is_pinned"] = *req.IsPinned
	}
	if req.IsFeatured != nil {
		updates["is_featured"] = *req.IsFeatured
	}
	if err := dal.DB.WithContext(ctx).Model(&model.Post{}).Where("id = ?", postID).Updates(updates).Error; err != nil {
		log.Printf("[SetPostStatus] 更新帖子状态失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	var updated model.Post
	if err := dal.DB.WithContext(ctx).Preload("Author").Preload("Tags").First(&updated, "id = ?", postID).Error; err != nil {
		log.Printf("[SetPostStatus] 重新加载帖子失败, postID=%s, err=%v", postID, err)
		return nil, err
	}

	commentCounts := batchCommentCount(ctx, []string{postID})
	likedSet := batchLikedPostIDs(ctx, []string{postID}, "")
	bookmarkedSet := batchBookmarkedPostIDs(ctx, []string{postID}, "")
	tagNames := mapper.ExtractTagNames(updated.Tags)
	dto := mapper.PostToDTO(&updated, commentCounts[postID], likedSet[postID], bookmarkedSet[postID], tagNames)
	return &dto, nil
}

// LikePost 点赞帖子，返回 (likeCount, alreadyLiked, error)
func (s *PostService) LikePost(ctx context.Context, postID, userID string) (int, bool, error) {
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id", "like_count").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, false, ErrPostNotFound_Post
		}
		log.Printf("[LikePost] 查询帖子失败, postID=%s, err=%v", postID, err)
		return 0, false, err
	}

	// 检查是否已点赞
	var existing model.PostLike
	if err := dal.DB.WithContext(ctx).Where("post_id = ? AND user_id = ?", postID, userID).First(&existing).Error; err == nil {
		return post.LikeCount, true, nil
	} else if err != gorm.ErrRecordNotFound {
		log.Printf("[LikePost] 检查点赞状态失败, postID=%s, userID=%s, err=%v", postID, userID, err)
		return 0, false, err
	}

	// 事务：创建点赞 + 增加计数
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		like := &model.PostLike{PostID: postID, UserID: userID}
		if err := tx.Create(like).Error; err != nil {
			return err
		}
		return tx.Model(&model.Post{}).Where("id = ?", postID).UpdateColumn("like_count", gorm.Expr("like_count + 1")).Error
	})
	if err != nil {
		if notification.IsUniqueConstraintError(err) {
			var p model.Post
			if err := dal.DB.WithContext(ctx).Select("like_count").First(&p, "id = ?", postID).Error; err != nil {
				log.Printf("[LikePost] 查询点赞数失败, postID=%s, err=%v", postID, err)
				return 0, false, err
			}
			return p.LikeCount, true, nil
		}
		log.Printf("[LikePost] 点赞事务失败, postID=%s, userID=%s, err=%v", postID, userID, err)
		return 0, false, err
	}

	// 通知帖子作者被点赞
	notification.Create(ctx, notification.CreateInput{
		UserID:  post.AuthorID,
		Type:    "like",
		ActorID: userID,
		PostID:  postID,
	})

	var updated model.Post
	if err := dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", postID).Error; err != nil {
		log.Printf("[LikePost] 查询点赞数失败, postID=%s, err=%v", postID, err)
		return 0, false, err
	}
	return updated.LikeCount, false, nil
}

// UnlikePost 取消点赞
func (s *PostService) UnlikePost(ctx context.Context, postID, userID string) (int, error) {
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "like_count").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, ErrPostNotFound_Post
		}
		log.Printf("[UnlikePost] 查询帖子失败, postID=%s, err=%v", postID, err)
		return 0, err
	}

	var rowsAffected int64
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Where("post_id = ? AND user_id = ?", postID, userID).Delete(&model.PostLike{})
		if result.Error != nil {
			return result.Error
		}
		rowsAffected = result.RowsAffected
		if rowsAffected == 0 {
			return nil
		}
		return tx.Model(&model.Post{}).Where("id = ? AND like_count > 0", postID).UpdateColumn("like_count", gorm.Expr("like_count - 1")).Error
	})
	if err != nil {
		log.Printf("[UnlikePost] 事务执行失败, postID=%s, userID=%s, err=%v", postID, userID, err)
		return 0, err
	}
	if rowsAffected == 0 {
		return post.LikeCount, nil
	}

	var updated model.Post
	if err := dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", postID).Error; err != nil {
		log.Printf("[UnlikePost] 查询点赞数失败, postID=%s, err=%v", postID, err)
		return 0, err
	}
	return updated.LikeCount, nil
}

// PopularTags 热门标签
func (s *PostService) PopularTags(ctx context.Context) ([]map[string]interface{}, error) {
	type tagCount struct {
		Name      string
		PostCount int
	}
	var rows []tagCount
	if err := dal.DB.WithContext(ctx).
		Model(&model.Tag{}).
		Select("tags.name as name, count(post_tags.post_id) as post_count").
		Joins("LEFT JOIN post_tags ON post_tags.tag_id = tags.id").
		Group("tags.id, tags.name").
		Having("count(post_tags.post_id) > 0").
		Order("post_count DESC").
		Limit(20).
		Find(&rows).Error; err != nil {
		log.Printf("[PopularTags] 查询热门标签失败, err=%v", err)
		return nil, err
	}

	items := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		items = append(items, map[string]interface{}{
			"name":      r.Name,
			"postCount": r.PostCount,
		})
	}
	return items, nil
}

// tagCache 标签推荐缓存。
// key 用归一化哈希，让「只改排版不改内容」的编辑仍然命中——
// 用户发帖前反复调标点、加粗、改分段是常态，
// 原先直接对原文取 md5 会导致缓存几乎永不命中。
var tagCache = digest.NewCache(digest.DefaultTTL, 0)

// tagCacheSep 分隔缓存值中的多个标签
const tagCacheSep = "\x1f"

// SuggestTags AI 标签推荐（含缓存 + 失败降级）
func (s *PostService) SuggestTags(ctx context.Context, userID, title, content string) ([]string, error) {
	key := digest.NormHash("tags", title, content)

	if cached, ok := aiCacheGet(ctx, tagCache, "tags", key); ok {
		if cached == "" {
			return []string{}, nil
		}
		return strings.Split(cached, tagCacheSep), nil
	}

	truncatedTitle := title
	if runes := []rune(truncatedTitle); len(runes) > 200 {
		truncatedTitle = string(runes[:200])
	}

	// 摘录替代前缀截断：标签需要判断全篇主题，
	// 只看开头容易漏掉后半段才出现的领域信息。
	d := digest.For(content, digest.BudgetTags)
	truncatedContent := d.Text

	systemPrompt := `你是社区分类标签助手。根据帖子标题和内容，为其分配 2-5 个分类标签，让帖子能被归到合适的类别下方便检索。

要求：
- 标签是分类名称，不是内容关键词或人名
- 每个标签 2-6 个字
- 不加 # 号或引号
- 只返回标签，用逗号分隔
- 无论内容长短，必须返回至少 2 个分类标签

分类参考：技术（前端、后端、AI、移动端、数据库、运维）、游戏（手游、端游、主机、攻略、赛事）、设计（UI、UX、平面、插画）、生活（美食、旅行、健身、宠物）、文化（文学、历史、电影、音乐、读书）、职场（求职、面试、副业、管理）、学术（数学、物理、论文）、其他

例如：
- "王者荣耀嫦娥攻略" -> "手游,攻略,游戏"
- "鲁迅与狂人日记" -> "文学,读书,文化"
- "React Server Components 实战" -> "前端,技术,React"
- "周末去大理旅游攻略" -> "旅行,生活,攻略"`

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        fmt.Sprintf("标题：%s\n内容：%s", truncatedTitle, truncatedContent),
		MaxTokens:   1000,
		Temperature: 0.3,
		UserID:      userID,
		Feature:     "suggest_tags",
	})
	if err != nil {
		// 降级：返回空标签数组，不阻塞发帖
		return []string{}, nil
	}

	// 解析逗号分隔标签
	separators := func(r rune) bool {
		return r == ',' || r == '，' || r == '、' || r == ' ' || r == '\n' || r == '\t'
	}
	rawTags := strings.FieldsFunc(text, separators)

	var tags []string
	for _, t := range rawTags {
		t = strings.TrimSpace(t)
		t = strings.TrimPrefix(t, "#")
		if len(t) > 0 && len([]rune(t)) <= 20 {
			tags = append(tags, t)
		}
		if len(tags) >= 5 {
			break
		}
	}

	log.Printf("[AI/SuggestTags] digest strategy=%s in=%d out=%d",
		d.Strategy, len([]rune(content)), len([]rune(truncatedContent)))

	// 写入缓存（即使结果为空也缓存，避免重复调用）
	aiCacheSet(ctx, tagCache, "tags", key, strings.Join(tags, tagCacheSep))

	return tags, nil
}
