package service

import (
	"context"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// NotificationService 通知服务
type NotificationService struct{}

// ListNotifications 获取当前用户的通知列表
func (s *NotificationService) ListNotifications(ctx context.Context, userID string, page, pageSize int) (*types.Paginated[types.Notification], error) {
	var total int64
	dal.DB.WithContext(ctx).Model(&model.Notification{}).Where("user_id = ?", userID).Count(&total)

	offset := (page - 1) * pageSize
	var rows []model.Notification
	dal.DB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&rows)

	// 批量获取 actor 用户名
	actorIDs := make([]string, 0)
	for _, r := range rows {
		if r.ActorID != nil {
			actorIDs = append(actorIDs, *r.ActorID)
		}
	}
	actorMap := make(map[string]string)
	if len(actorIDs) > 0 {
		var actors []model.User
		dal.DB.WithContext(ctx).Where("id IN ?", actorIDs).Select("id", "username").Find(&actors)
		for _, a := range actors {
			actorMap[a.ID] = a.Username
		}
	}

	items := make([]types.Notification, 0, len(rows))
	for _, r := range rows {
		var actorName *string
		if r.ActorID != nil {
			if name, ok := actorMap[*r.ActorID]; ok {
				n := name
				actorName = &n
			}
		}
		items = append(items, mapper.NotificationToDTO(&r, actorName))
	}

	return &types.Paginated[types.Notification]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// UnreadCount 获取未读通知数量
func (s *NotificationService) UnreadCount(ctx context.Context, userID string) (int64, error) {
	var count int64
	err := dal.DB.WithContext(ctx).Model(&model.Notification{}).
		Where("user_id = ? AND read = ?", userID, false).
		Count(&count).Error
	return count, err
}

// MarkNotificationRead 标记单条通知为已读
func (s *NotificationService) MarkNotificationRead(ctx context.Context, notifID, userID string) error {
	var notif model.Notification
	if err := dal.DB.WithContext(ctx).Select("id", "user_id").First(&notif, "id = ?", notifID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return &NotificationError{Msg: "通知不存在", Code: 404}
		}
		return err
	}
	if notif.UserID != userID {
		return &NotificationError{Msg: "无权操作", Code: 403}
	}
	return dal.DB.WithContext(ctx).Model(&model.Notification{}).Where("id = ?", notifID).Update("read", true).Error
}

// MarkAllRead 全部标记为已读
func (s *NotificationService) MarkAllRead(ctx context.Context, userID string) error {
	return dal.DB.WithContext(ctx).Model(&model.Notification{}).
		Where("user_id = ? AND read = ?", userID, false).
		Update("read", true).Error
}

// GetPreferences 获取当前用户的通知偏好（未设置时返回默认值）
func (s *NotificationService) GetPreferences(ctx context.Context, userID string) (*types.NotificationPreference, error) {
	var pref model.NotificationPreference
	err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&pref).Error
	if err == gorm.ErrRecordNotFound {
		return &types.NotificationPreference{
			Comment: true, Reply: true, Like: true, Follow: true, Mention: true,
			DoNotDisturb: false, QuietStartHour: 22, QuietEndHour: 8,
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return s.toPreferenceDTO(&pref), nil
}

// UpdatePreferences 更新通知偏好（不存在则创建，仅更新传入字段）
func (s *NotificationService) UpdatePreferences(ctx context.Context, userID string, req types.UpdateNotificationPreferenceReq) (*types.NotificationPreference, error) {
	// 校验免打扰时段合法性
	if req.QuietStartHour != nil && (*req.QuietStartHour < 0 || *req.QuietStartHour > 23) {
		return nil, ErrInvalidInput
	}
	if req.QuietEndHour != nil && (*req.QuietEndHour < 0 || *req.QuietEndHour > 23) {
		return nil, ErrInvalidInput
	}

	updates := map[string]interface{}{}
	if req.Comment != nil {
		updates["comment"] = *req.Comment
	}
	if req.Reply != nil {
		updates["reply"] = *req.Reply
	}
	if req.Like != nil {
		updates["like"] = *req.Like
	}
	if req.Follow != nil {
		updates["follow"] = *req.Follow
	}
	if req.Mention != nil {
		updates["mention"] = *req.Mention
	}
	if req.DoNotDisturb != nil {
		updates["do_not_disturb"] = *req.DoNotDisturb
	}
	if req.QuietStartHour != nil {
		updates["quiet_start_hour"] = *req.QuietStartHour
	}
	if req.QuietEndHour != nil {
		updates["quiet_end_hour"] = *req.QuietEndHour
	}

	// 先查是否存在，不存在则创建默认记录
	var pref model.NotificationPreference
	err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&pref).Error
	if err == gorm.ErrRecordNotFound {
		pref = model.NotificationPreference{UserID: userID}
		if err := dal.DB.WithContext(ctx).Create(&pref).Error; err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	if err := dal.DB.WithContext(ctx).Model(&model.NotificationPreference{}).
		Where("user_id = ?", userID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	if err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&pref).Error; err != nil {
		return nil, err
	}
	return s.toPreferenceDTO(&pref), nil
}

func (s *NotificationService) toPreferenceDTO(p *model.NotificationPreference) *types.NotificationPreference {
	return &types.NotificationPreference{
		Comment:        p.Comment,
		Reply:          p.Reply,
		Like:           p.Like,
		Follow:         p.Follow,
		Mention:        p.Mention,
		DoNotDisturb:   p.DoNotDisturb,
		QuietStartHour: p.QuietStartHour,
		QuietEndHour:   p.QuietEndHour,
	}
}

// NotificationError 通知业务错误
type NotificationError struct {
	Msg  string
	Code int
}

func (e *NotificationError) Error() string { return e.Msg }

// ========== Search Service ==========

// SearchService 搜索服务
type SearchService struct{}

// SearchResult 搜索结果（scope=all 时的聚合返回）
type SearchResult struct {
	Posts    *SearchScopeResult `json:"posts"`
	Comments *SearchScopeResult `json:"comments"`
	Users    *SearchScopeResult `json:"users"`
}

type SearchScopeResult struct {
	Items interface{} `json:"items"`
	Total int         `json:"total"`
}

func parseTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02", s)
		if err != nil {
			return time.Time{}, false
		}
	}
	return t, true
}

// Search 统一搜索
func (s *SearchService) Search(ctx context.Context, q, scope, channel, author, from, to, sort, userID string, page, pageSize int) (interface{}, error) {
	q = strings.TrimSpace(q)

	if q == "" {
		if scope == "all" {
			return &SearchResult{
				Posts:    &SearchScopeResult{Items: []interface{}{}, Total: 0},
				Comments: &SearchScopeResult{Items: []interface{}{}, Total: 0},
				Users:    &SearchScopeResult{Items: []interface{}{}, Total: 0},
			}, nil
		}
		return &types.Paginated[interface{}]{
			Items: []interface{}{}, Total: 0, Page: page, PageSize: pageSize, TotalPages: 0,
		}, nil
	}

	like := "%" + q + "%"

	// 构建日期范围
	var fromTime, toTime time.Time
	hasFrom := false
	hasTo := false
	if from != "" {
		fromTime, hasFrom = parseTime(from)
	}
	if to != "" {
		toTime, hasTo = parseTime(to)
	}

	// 可复用的 where 条件构建器：每次调用返回独立的 *gorm.DB 查询链
	// 确保 count 和 find 使用完全相同的过滤条件

	// Post: title / content / author.username 命中关键词
	postWhere := func() *gorm.DB {
		w := dal.DB.WithContext(ctx).Model(&model.Post{}).
			Where("title ILIKE ? OR content ILIKE ? OR author_id IN (?)",
				like, like,
				dal.DB.Model(&model.User{}).Select("id").Where("username ILIKE ?", like))
		if channel != "" && validChannel(ctx, channel) {
			w = w.Where("channel = ?", channel)
		}
		if author != "" {
			w = w.Where("author_id IN (?)",
				dal.DB.Model(&model.User{}).Select("id").Where("username ILIKE ?", "%"+author+"%"))
		}
		if hasFrom {
			w = w.Where("created_at >= ?", fromTime)
		}
		if hasTo {
			w = w.Where("created_at <= ?", toTime)
		}
		return w
	}

	// Comment: content 命中关键词
	commentWhere := func() *gorm.DB {
		w := dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("content ILIKE ?", like)
		if hasFrom {
			w = w.Where("created_at >= ?", fromTime)
		}
		if hasTo {
			w = w.Where("created_at <= ?", toTime)
		}
		return w
	}

	// User: username / displayName 命中关键词
	userWhere := func() *gorm.DB {
		w := dal.DB.WithContext(ctx).Model(&model.User{}).
			Where("username ILIKE ? OR display_name ILIKE ?", like, like)
		if hasFrom {
			w = w.Where("created_at >= ?", fromTime)
		}
		if hasTo {
			w = w.Where("created_at <= ?", toTime)
		}
		return w
	}

	if scope == "all" {
		// Posts
		var postRows []model.Post
		var postTotal int64
		postWhere().Preload("Author").Preload("Tags").Order("created_at DESC").Limit(5).Find(&postRows)
		postWhere().Count(&postTotal)

		postItems := mapPostsToDTOs(ctx, postRows, userID)

		// Comments
		var commentRows []model.Comment
		var commentTotal int64
		commentWhere().Preload("Author").Preload("Post").Order("created_at DESC").Limit(5).Find(&commentRows)
		commentWhere().Count(&commentTotal)

		commentItems := make([]types.SearchComment, 0, len(commentRows))
		for _, c := range commentRows {
			item := types.SearchComment{
				ID:        c.ID,
				Content:   c.Content,
				PostID:    c.PostID,
				AuthorID:  c.AuthorID,
				Author:    mapper.AuthorToDTO(&c.Author),
				CreatedAt: c.CreatedAt.Format(time.RFC3339),
				LikeCount: c.LikeCount,
			}
			item.Post.ID = c.Post.ID
			item.Post.Title = c.Post.Title
			item.Post.Channel = c.Post.Channel
			commentItems = append(commentItems, item)
		}

		// Users
		var userRows []model.User
		var userTotal int64
		userWhere().Select("id", "username", "avatar", "bio", "display_name", "created_at").
			Order("created_at DESC").Limit(5).Find(&userRows)
		userWhere().Count(&userTotal)

		userItems := make([]types.SearchUser, 0, len(userRows))
		for _, u := range userRows {
			userItems = append(userItems, types.SearchUser{
				ID:          u.ID,
				Username:    u.Username,
				Avatar:      u.Avatar,
				DisplayName: u.DisplayName,
				Bio:         u.Bio,
				CreatedAt:   u.CreatedAt.Format(time.RFC3339),
			})
		}

		return &SearchResult{
			Posts:    &SearchScopeResult{Items: postItems, Total: int(postTotal)},
			Comments: &SearchScopeResult{Items: commentItems, Total: int(commentTotal)},
			Users:    &SearchScopeResult{Items: userItems, Total: int(userTotal)},
		}, nil
	}

	// 单一 scope 分页查询
	offset := (page - 1) * pageSize

	if scope == "posts" {
		var total int64
		postWhere().Count(&total)

		var rows []model.Post
		if sort == "relevance" {
			// 相关度排序（数据库层，pg_trgm 相似度 + 标题命中加权，无 500 条限制）
			postWhere().Preload("Author").Preload("Tags").
				Order(gorm.Expr(
					"CASE WHEN title ILIKE ? THEN 1 ELSE 0 END DESC, similarity(title, ?) DESC, created_at DESC",
					like, q,
				)).
				Offset(offset).Limit(pageSize).Find(&rows)
		} else {
			postWhere().Preload("Author").Preload("Tags").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&rows)
		}

		items := mapPostsToDTOs(ctx, rows, userID)
		return &types.Paginated[types.Post]{
			Items: items, Total: int(total), Page: page, PageSize: pageSize,
			TotalPages: pagination.TotalPages(int(total), pageSize),
		}, nil
	}

	if scope == "comments" {
		var total int64
		commentWhere().Count(&total)

		var rows []model.Comment
		if sort == "relevance" {
			commentWhere().Preload("Author").Preload("Post").
				Order(gorm.Expr("similarity(content, ?) DESC, created_at DESC", q)).
				Offset(offset).Limit(pageSize).Find(&rows)
		} else {
			commentWhere().Preload("Author").Preload("Post").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&rows)
		}

		items := make([]types.SearchComment, 0, len(rows))
		for _, c := range rows {
			item := types.SearchComment{
				ID:        c.ID,
				Content:   c.Content,
				PostID:    c.PostID,
				AuthorID:  c.AuthorID,
				Author:    mapper.AuthorToDTO(&c.Author),
				CreatedAt: c.CreatedAt.Format(time.RFC3339),
				LikeCount: c.LikeCount,
			}
			item.Post.ID = c.Post.ID
			item.Post.Title = c.Post.Title
			item.Post.Channel = c.Post.Channel
			items = append(items, item)
		}

		return &types.Paginated[types.SearchComment]{
			Items: items, Total: int(total), Page: page, PageSize: pageSize,
			TotalPages: pagination.TotalPages(int(total), pageSize),
		}, nil
	}

	// scope == "users"
	var total int64
	userWhere().Count(&total)

	var rows []model.User
	if sort == "relevance" {
		userWhere().Select("id", "username", "avatar", "bio", "display_name", "created_at").
			Order(gorm.Expr(
				"similarity(username, ?) + similarity(coalesce(display_name, ''), ?) DESC, created_at DESC",
				q, q,
			)).
			Offset(offset).Limit(pageSize).Find(&rows)
	} else {
		userWhere().Select("id", "username", "avatar", "bio", "display_name", "created_at").
			Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&rows)
	}

	items := make([]types.SearchUser, 0, len(rows))
	for _, u := range rows {
		items = append(items, types.SearchUser{
			ID:          u.ID,
			Username:    u.Username,
			Avatar:      u.Avatar,
			DisplayName: u.DisplayName,
			Bio:         u.Bio,
			CreatedAt:   u.CreatedAt.Format(time.RFC3339),
		})
	}

	return &types.Paginated[types.SearchUser]{
		Items: items, Total: int(total), Page: page, PageSize: pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}
