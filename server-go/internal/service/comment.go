package service

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// CommentService 评论服务
type CommentService struct{}

// CommentError 评论业务错误
type CommentError struct {
	Msg  string
	Code int
}

func (e *CommentError) Error() string { return e.Msg }

var (
	ErrPostNotFound         = &CommentError{Msg: "帖子不存在", Code: 404}
	ErrCommentNotFound      = &CommentError{Msg: "评论不存在", Code: 404}
	ErrParentCommentInvalid = &CommentError{Msg: "父评论不存在或不属于该帖子", Code: 400}
	ErrCommentForbidden     = &CommentError{Msg: "无权操作他人的评论", Code: 403}
)

// truncateContent 截断通知内容到 50 个字符（按 rune 计），超出加省略号
func truncateContent(content string) string {
	runes := []rune(content)
	if len(runes) > 50 {
		return string(runes[:50]) + "…"
	}
	return content
}

// replyPreviewLimit 每条根评论初始加载的回复条数
const replyPreviewLimit = 3

// ListComments 获取帖子的评论列表（根评论分页 + 每条根评论前 N 条回复预览）
func (s *CommentService) ListComments(ctx context.Context, postID, currentUserID string, page, pageSize int) (*types.Paginated[types.Comment], error) {
	// 检查帖子是否存在
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound
		}
		return nil, err
	}

	// 过滤当前用户屏蔽的评论作者
	blocked := blockedIDList(ctx, currentUserID)

	// 根评论总数
	baseWhere := "post_id = ? AND parent_id IS NULL"
	var total int64
	query := dal.DB.WithContext(ctx).Model(&model.Comment{}).Where(baseWhere, postID)
	if len(blocked) > 0 {
		query = query.Where("author_id NOT IN ?", blocked)
	}
	query.Count(&total)

	offset := (page - 1) * pageSize

	// 分页加载根评论（倒序，最新在前）
	var rootRows []model.Comment
	rootQuery := dal.DB.WithContext(ctx).
		Preload("Author").
		Where(baseWhere, postID)
	if len(blocked) > 0 {
		rootQuery = rootQuery.Where("author_id NOT IN ?", blocked)
	}
	rootQuery.Order("created_at DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&rootRows)

	if len(rootRows) == 0 {
		return &types.Paginated[types.Comment]{
			Items:      []types.Comment{},
			Total:      int(total),
			Page:       page,
			PageSize:   pageSize,
			TotalPages: pagination.TotalPages(int(total), pageSize),
		}, nil
	}

	// 收集根评论 ID
	rootIDs := make([]string, 0, len(rootRows))
	for i := range rootRows {
		rootIDs = append(rootIDs, rootRows[i].ID)
	}

	// 批量查询每条根评论的回复总数
	type countRow struct {
		ParentID string
		Cnt      int64
	}
	var countRows []countRow
	replyCountQuery := dal.DB.WithContext(ctx).Model(&model.Comment{}).
		Select("parent_id as parent_id, COUNT(*) as cnt").
		Where("parent_id IN ?", rootIDs)
	if len(blocked) > 0 {
		replyCountQuery = replyCountQuery.Where("author_id NOT IN ?", blocked)
	}
	replyCountQuery.Group("parent_id").Scan(&countRows)
	replyCountMap := make(map[string]int, len(countRows))
	for _, r := range countRows {
		replyCountMap[r.ParentID] = int(r.Cnt)
	}

	// 批量加载每条根评论的前 replyPreviewLimit 条回复（按时间正序）
	var previewReplies []model.Comment
	previewQuery := dal.DB.WithContext(ctx).
		Preload("Author").
		Where("parent_id IN ?", rootIDs)
	if len(blocked) > 0 {
		previewQuery = previewQuery.Where("author_id NOT IN ?", blocked)
	}
	previewQuery.Order("created_at ASC").Find(&previewReplies)

	// 按 parent_id 分组，每组只取前 replyPreviewLimit 条
	repliesMap := make(map[string][]model.Comment)
	for i := range previewReplies {
		pid := *previewReplies[i].ParentID
		if len(repliesMap[pid]) < replyPreviewLimit {
			repliesMap[pid] = append(repliesMap[pid], previewReplies[i])
		}
	}

	// 收集所有预览回复的 ID，用于批量查点赞状态
	allIDs := make([]string, 0, len(rootRows)+len(previewReplies))
	allIDs = append(allIDs, rootIDs...)
	for i := range previewReplies {
		allIDs = append(allIDs, previewReplies[i].ID)
	}

	// 批量查询当前用户的点赞状态
	likedSet := make(map[string]bool)
	if currentUserID != "" && len(allIDs) > 0 {
		var likes []model.CommentLike
		dal.DB.WithContext(ctx).
			Where("user_id = ? AND comment_id IN ?", currentUserID, allIDs).
			Select("comment_id").
			Find(&likes)
		for _, l := range likes {
			likedSet[l.CommentID] = true
		}
	}

	// 构建 DTO
	items := make([]types.Comment, 0, len(rootRows))
	for i := range rootRows {
		root := &rootRows[i]
		children := repliesMap[root.ID]
		replies := make([]types.Comment, 0, len(children))
		for j := range children {
			c := &children[j]
			replies = append(replies, mapper.CommentToDTO(c, likedSet[c.ID], []types.Comment{}, 0))
		}
		rc := replyCountMap[root.ID]
		items = append(items, mapper.CommentToDTO(root, likedSet[root.ID], replies, rc))
	}

	return &types.Paginated[types.Comment]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ListReplies 分页加载某条根评论的回复（扁平列表，非树形）
func (s *CommentService) ListReplies(ctx context.Context, commentID, currentUserID string, page, pageSize int) (*types.Paginated[types.Comment], error) {
	// 检查评论是否存在
	var comment model.Comment
	if err := dal.DB.WithContext(ctx).Select("id").First(&comment, "id = ?", commentID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrCommentNotFound
		}
		return nil, err
	}

	// 回复总数
	var total int64
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("parent_id = ?", commentID).Count(&total)

	offset := (page - 1) * pageSize

	// 分页加载回复（正序，时间从早到晚）
	var rows []model.Comment
	dal.DB.WithContext(ctx).
		Preload("Author").
		Where("parent_id = ?", commentID).
		Order("created_at ASC").
		Offset(offset).
		Limit(pageSize).
		Find(&rows)

	// 收集 ID 批量查点赞状态
	ids := make([]string, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	likedSet := make(map[string]bool)
	if currentUserID != "" && len(ids) > 0 {
		var likes []model.CommentLike
		dal.DB.WithContext(ctx).
			Where("user_id = ? AND comment_id IN ?", currentUserID, ids).
			Select("comment_id").
			Find(&likes)
		for _, l := range likes {
			likedSet[l.CommentID] = true
		}
	}

	items := make([]types.Comment, 0, len(rows))
	for i := range rows {
		c := &rows[i]
		items = append(items, mapper.CommentToDTO(c, likedSet[c.ID], []types.Comment{}, 0))
	}

	return &types.Paginated[types.Comment]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// CreateComment 创建评论或回复
func (s *CommentService) CreateComment(ctx context.Context, postID, userID string, req types.CreateCommentReq) (*types.Comment, error) {
	// 检查帖子存在并获取作者 ID（用于通知）
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound
		}
		return nil, err
	}

	// 若指定父评论，校验其属于同一帖子，并取出其作者用于回复通知
	var parentAuthorID string
	if req.ParentID != nil {
		var parent model.Comment
		if err := dal.DB.WithContext(ctx).Select("id", "post_id", "author_id").First(&parent, "id = ?", *req.ParentID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil, ErrParentCommentInvalid
			}
			return nil, err
		}
		if parent.PostID != postID {
			return nil, ErrParentCommentInvalid
		}
		parentAuthorID = parent.AuthorID
	}

	// 创建评论
	created := &model.Comment{
		Content:  req.Content,
		PostID:   postID,
		AuthorID: userID,
		ParentID: req.ParentID,
	}
	if err := dal.DB.WithContext(ctx).Create(created).Error; err != nil {
		return nil, err
	}

	// 加载作者信息用于 DTO
	if err := dal.DB.WithContext(ctx).Preload("Author").First(created, "id = ?", created.ID).Error; err != nil {
		return nil, err
	}

	// 产生通知：回复评论通知被回复者，普通评论通知帖子作者
	notifContent := truncateContent(req.Content)
	if req.ParentID != nil {
		notification.Create(ctx, notification.CreateInput{
			UserID:    parentAuthorID,
			Type:      "reply",
			ActorID:   userID,
			PostID:    postID,
			CommentID: created.ID,
			Content:   notifContent,
		})
	} else {
		notification.Create(ctx, notification.CreateInput{
			UserID:    post.AuthorID,
			Type:      "comment",
			ActorID:   userID,
			PostID:    postID,
			CommentID: created.ID,
			Content:   notifContent,
		})
	}

	// 解析评论内容中的 @提及
	notification.CreateMentionNotifications(ctx, req.Content, userID, postID, created.ID)

	dto := mapper.CommentToDTO(created, false, []types.Comment{}, 0)
	return &dto, nil
}

// LikeComment 点赞评论，返回 (likeCount, alreadyLiked, error)
func (s *CommentService) LikeComment(ctx context.Context, commentID, userID string) (int, bool, error) {
	var comment model.Comment
	if err := dal.DB.WithContext(ctx).Select("id", "like_count").First(&comment, "id = ?", commentID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, false, ErrCommentNotFound
		}
		return 0, false, err
	}

	// 检查是否已点赞
	var existing model.CommentLike
	if err := dal.DB.WithContext(ctx).Where("comment_id = ? AND user_id = ?", commentID, userID).First(&existing).Error; err == nil {
		return comment.LikeCount, true, nil
	} else if err != gorm.ErrRecordNotFound {
		return 0, false, err
	}

	// 事务：创建点赞 + 增加计数，捕获并发下的唯一约束冲突
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		like := &model.CommentLike{
			CommentID: commentID,
			UserID:    userID,
		}
		if err := tx.Create(like).Error; err != nil {
			return err
		}
		return tx.Model(&model.Comment{}).Where("id = ?", commentID).UpdateColumn("like_count", gorm.Expr("like_count + 1")).Error
	})
	if err != nil {
		if notification.IsUniqueConstraintError(err) {
			var c2 model.Comment
			dal.DB.WithContext(ctx).Select("like_count").First(&c2, "id = ?", commentID)
			return c2.LikeCount, true, nil
		}
		return 0, false, err
	}

	var updated model.Comment
	dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", commentID)
	return updated.LikeCount, false, nil
}

// UnlikeComment 取消点赞，返回 (likeCount, error)
func (s *CommentService) UnlikeComment(ctx context.Context, commentID, userID string) (int, error) {
	var comment model.Comment
	if err := dal.DB.WithContext(ctx).Select("id", "like_count").First(&comment, "id = ?", commentID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, ErrCommentNotFound
		}
		return 0, err
	}

	// 幂等删除（DeleteMany 语义：零匹配不报错）
	result := dal.DB.WithContext(ctx).Where("comment_id = ? AND user_id = ?", commentID, userID).Delete(&model.CommentLike{})
	if result.Error != nil {
		return 0, result.Error
	}

	if result.RowsAffected == 0 {
		return comment.LikeCount, nil
	}

	// 减少计数（gt:0 条件防止减为负数）
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("id = ? AND like_count > 0", commentID).UpdateColumn("like_count", gorm.Expr("like_count - 1"))

	var updated model.Comment
	dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", commentID)
	return updated.LikeCount, nil
}
