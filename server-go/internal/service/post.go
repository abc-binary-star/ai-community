package service

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
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
		items = append(items, mapper.PostToDTO(&p, commentCounts[p.ID], likedSet[p.ID], bookmarkedSet[p.ID], tagNames))
	}
	return items
}

// ListPosts 帖子列表
// status: 空或 published=公开列表；draft=仅当前用户自己的草稿
func (s *PostService) ListPosts(ctx context.Context, channel, sortParam, q, tag, status, userID string, page, pageSize int) (*types.Paginated[types.Post], error) {
	// 校验 channel，无效时回退到 general
	if channel != "all" && !validChannel(ctx, channel) {
		channel = "general"
	}

	query := dal.DB.WithContext(ctx).Model(&model.Post{})

	// 状态过滤：草稿仅本人可见，公开列表只显示已发布
	if status == "draft" {
		if userID == "" {
			return &types.Paginated[types.Post]{Items: []types.Post{}, Total: 0, Page: page, PageSize: pageSize, TotalPages: 0}, nil
		}
		query = query.Where("status = ? AND author_id = ?", "draft", userID)
	} else {
		query = query.Where("status = ?", "published")
	}

	// 过滤当前用户屏蔽的作者
	if userID != "" && status != "draft" {
		if blocked := blockedIDList(ctx, userID); len(blocked) > 0 {
			query = query.Where("author_id NOT IN ?", blocked)
		}
	}

	if q != "" {
		like := "%" + q + "%"
		query = query.Where("title ILIKE ? OR content ILIKE ?", like, like)
	} else if channel != "" && channel != "all" {
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

	// 过滤当前用户屏蔽的作者
	if userID != "" && status != "draft" {
		if blocked := blockedIDList(ctx, userID); len(blocked) > 0 {
			dbQuery = dbQuery.Where("author_id NOT IN ?", blocked)
		}
	}

	// 状态过滤同步到 dbQuery
	if status == "draft" {
		dbQuery = dbQuery.Where("status = ? AND author_id = ?", "draft", userID)
	} else {
		dbQuery = dbQuery.Where("status = ?", "published")
	}

	// 复用相同的 where 条件
	if q != "" {
		like := "%" + q + "%"
		dbQuery = dbQuery.Where("title ILIKE ? OR content ILIKE ?", like, like)
	} else if channel != "" && channel != "all" {
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

// replacePostTags 全量替换帖子的标签关联
func replacePostTags(ctx context.Context, postID string, rawTags []string) error {
	// 删除旧关联
	if err := dal.DB.WithContext(ctx).Where("post_id = ?", postID).Delete(&model.PostTag{}).Error; err != nil {
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
		if err := dal.DB.WithContext(ctx).Where("name = ?", tagName).First(&tag).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				tag = model.Tag{Name: tagName}
				if err := dal.DB.WithContext(ctx).Create(&tag).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}
		if err := dal.DB.WithContext(ctx).Create(&model.PostTag{PostID: postID, TagID: tag.ID}).Error; err != nil {
			return err
		}
	}
	return nil
}

// CreatePost 创建帖子（支持 tags）
func (s *PostService) CreatePost(ctx context.Context, userID string, req types.CreatePostReq) (*types.Post, error) {
	channel := "general"
	if req.Channel != nil && validChannel(ctx, *req.Channel) {
		channel = *req.Channel
	}

	var created model.Post
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		status := req.Status
		if status == "" {
			status = "published"
		}
		post := &model.Post{
			Title:     req.Title,
			Content:   req.Content,
			Channel:   channel,
			AuthorID:  userID,
			Status:    status,
			AiSummary: req.AiSummary,
		}
		if err := tx.Create(post).Error; err != nil {
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
							return err
						}
					} else {
						return err
					}
				}
				// 创建关联
				if err := tx.Create(&model.PostTag{PostID: post.ID, TagID: tag.ID}).Error; err != nil {
					return err
				}
			}
		}

		// 重新加载带关联的数据
		return tx.Preload("Author").Preload("Tags").First(&created, "id = ?", post.ID).Error
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
	var existing model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id", "status").First(&existing, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		return nil, err
	}
	if existing.AuthorID != userID {
		return nil, ErrPostForbidden
	}

	// 字段长度校验：草稿允许标题/内容为空
	isDraft := existing.Status == "draft" || (req.Status != nil && *req.Status == "draft")
	if req.Title != nil {
		titleLen := len([]rune(*req.Title))
		if titleLen > 100 || (titleLen < 1 && !isDraft) {
			return nil, ErrPostInvalidInput
		}
	}
	if req.Content != nil {
		contentLen := len([]rune(*req.Content))
		if contentLen > 20000 || (contentLen < 1 && !isDraft) {
			return nil, ErrPostInvalidInput
		}
	}

	updates := map[string]interface{}{"edited": true}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.AiSummary != nil {
		updates["ai_summary"] = *req.AiSummary
	}
	if err := dal.DB.WithContext(ctx).Model(&model.Post{}).Where("id = ?", postID).Updates(updates).Error; err != nil {
		return nil, err
	}

	// 标签更新：全量替换
	if req.Tags != nil {
		if err := replacePostTags(ctx, postID, *req.Tags); err != nil {
			return nil, err
		}
	}

	var updated model.Post
	if err := dal.DB.WithContext(ctx).Preload("Author").Preload("Tags").First(&updated, "id = ?", postID).Error; err != nil {
		return nil, err
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
func (s *PostService) DeletePost(ctx context.Context, postID, userID string) error {
	var existing model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&existing, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrPostNotFound_Post
		}
		return err
	}
	if existing.AuthorID != userID {
		return ErrPostForbidden
	}
	return dal.DB.WithContext(ctx).Delete(&model.Post{}, "id = ?", postID).Error
}

// SetPostStatus 设置帖子置顶/精华状态（管理员/版主操作）
func (s *PostService) SetPostStatus(ctx context.Context, postID string, req types.UpdatePostStatusReq) (*types.Post, error) {
	var existing model.Post
	if err := dal.DB.WithContext(ctx).Select("id").First(&existing, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
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
		return nil, err
	}

	var updated model.Post
	if err := dal.DB.WithContext(ctx).Preload("Author").Preload("Tags").First(&updated, "id = ?", postID).Error; err != nil {
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
		return 0, false, err
	}

	// 检查是否已点赞
	var existing model.PostLike
	if err := dal.DB.WithContext(ctx).Where("post_id = ? AND user_id = ?", postID, userID).First(&existing).Error; err == nil {
		return post.LikeCount, true, nil
	} else if err != gorm.ErrRecordNotFound {
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
				return 0, false, err
			}
			return p.LikeCount, true, nil
		}
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
		return 0, err
	}

	result := dal.DB.WithContext(ctx).Where("post_id = ? AND user_id = ?", postID, userID).Delete(&model.PostLike{})
	if result.Error != nil {
		return 0, result.Error
	}
	if result.RowsAffected == 0 {
		return post.LikeCount, nil
	}

	if err := dal.DB.WithContext(ctx).Model(&model.Post{}).Where("id = ? AND like_count > 0", postID).UpdateColumn("like_count", gorm.Expr("like_count - 1")).Error; err != nil {
		return 0, err
	}

	var updated model.Post
	if err := dal.DB.WithContext(ctx).Select("like_count").First(&updated, "id = ?", postID).Error; err != nil {
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

// tagCacheEntry 标签缓存条目
type tagCacheEntry struct {
	tags      []string
	expiresAt time.Time
}

// tagCache 标签推荐内存缓存（TTL 7 天）
var tagCache sync.Map

// tagCacheTTL 缓存有效期
const tagCacheTTL = 7 * 24 * time.Hour

// SuggestTags AI 标签推荐（含缓存 + 失败降级）
func (s *PostService) SuggestTags(ctx context.Context, title, content string) ([]string, error) {
	// 构造缓存 key
	key := tagCacheKey(title, content)

	// 查缓存
	if cached, ok := tagCache.Load(key); ok {
		if entry, ok := cached.(*tagCacheEntry); ok && time.Now().Before(entry.expiresAt) {
			return entry.tags, nil
		}
	}

	truncatedTitle := title
	if runes := []rune(truncatedTitle); len(runes) > 200 {
		truncatedTitle = string(runes[:200])
	}

	truncatedContent := content
	if runes := []rune(truncatedContent); len(runes) > 2000 {
		truncatedContent = string(runes[:2000])
	}

	systemPrompt := `你是一个社区分类标签助手。根据帖子标题和内容，为其分配 2-5 个分类标签，让帖子能被归到合适的类别下方便检索。

要求：
1. 标签是分类名称，不是内容关键词或人名
2. 每个标签 2-6 个字
3. 不要加 # 号或引号
4. 只返回标签，用逗号分隔
5. 无论内容长短，必须返回至少 2 个分类标签

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

	// 写入缓存（即使结果为空也缓存，避免重复调用）
	tagCache.Store(key, &tagCacheEntry{
		tags:      tags,
		expiresAt: time.Now().Add(tagCacheTTL),
	})

	return tags, nil
}

// tagCacheKey 根据标题和内容生成缓存 key
func tagCacheKey(title, content string) string {
	h := md5.Sum([]byte(title + "\x00" + content))
	return hex.EncodeToString(h[:])
}
