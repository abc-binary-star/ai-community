package service

import (
	"context"
	"net/url"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// UserService 用户/关注/收藏业务服务
type UserService struct{}

// SearchUserItem 搜索用户返回项（仅含公开的最小字段）
type SearchUserItem struct {
	ID       string  `json:"id"`
	Username string  `json:"username"`
	Avatar   *string `json:"avatar"`
}

// ServiceError 业务错误，携带 HTTP 状态码
type ServiceError struct {
	Msg  string
	Code int
}

func (e *ServiceError) Error() string { return e.Msg }

// ErrUserNotFound / ErrPostNotFound 复用 auth.go 与 comment.go 中已声明的同名错误
var (
	ErrCannotFollowSelf = &ServiceError{Msg: "不能关注自己", Code: 400}
	ErrInvalidInput     = &ServiceError{Msg: "输入不合法", Code: 400}
	ErrCannotModifySelfRole = &ServiceError{Msg: "不能修改自己的角色", Code: 400}
)

// validRoles 允许的用户角色
var validRoles = map[string]bool{
	"user":       true,
	"moderator":  true,
	"admin":      true,
}

// ========== User Module ==========

// SearchUsers 按用户名模糊搜索，最多返回 10 条
func (s *UserService) SearchUsers(ctx context.Context, q string) ([]SearchUserItem, error) {
	if len(q) < 1 {
		return []SearchUserItem{}, nil
	}

	var users []model.User
	dal.DB.WithContext(ctx).
		Where("username ILIKE ?", "%"+q+"%").
		Select("id", "username", "avatar").
		Limit(10).
		Find(&users)

	items := make([]SearchUserItem, 0, len(users))
	for _, u := range users {
		items = append(items, SearchUserItem{
			ID:       u.ID,
			Username: u.Username,
			Avatar:   u.Avatar,
		})
	}
	return items, nil
}

// GetUser 查看用户主页（公开），批量计算统计与关注状态
func (s *UserService) GetUser(ctx context.Context, username, currentUserId string) (*types.PublicUser, error) {
	var u model.User
	err := dal.DB.WithContext(ctx).Where("username = ?", username).First(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	var postCount, followerCount, followingCount int64
	dal.DB.WithContext(ctx).Model(&model.Post{}).Where("author_id = ?", u.ID).Count(&postCount)
	dal.DB.WithContext(ctx).Model(&model.Follow{}).Where("following_id = ?", u.ID).Count(&followerCount)
	dal.DB.WithContext(ctx).Model(&model.Follow{}).Where("follower_id = ?", u.ID).Count(&followingCount)

	isFollowing := false
	if currentUserId != "" {
		var cnt int64
		dal.DB.WithContext(ctx).Model(&model.Follow{}).
			Where("follower_id = ? AND following_id = ?", currentUserId, u.ID).
			Count(&cnt)
		isFollowing = cnt > 0
	}

	dto := mapper.PublicUserToDTO(&u, int(postCount), int(followerCount), int(followingCount), isFollowing)
	return &dto, nil
}

// GetUserPosts 分页获取某用户发布的帖子
func (s *UserService) GetUserPosts(ctx context.Context, username, currentUserId string, page, pageSize int) (*types.Paginated[types.Post], error) {
	var u model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	var total int64
	dal.DB.WithContext(ctx).Model(&model.Post{}).Where("author_id = ?", u.ID).Count(&total)

	var posts []model.Post
	dal.DB.WithContext(ctx).
		Preload("Author").Preload("Tags").
		Where("author_id = ?", u.ID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&posts)

	items := s.mapPostsToDTO(ctx, posts, currentUserId)

	return &types.Paginated[types.Post]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// UpdateUser 更新当前用户资料
func (s *UserService) UpdateUser(ctx context.Context, userId string, req types.UpdateUserReq) (*types.User, error) {
	// 校验
	if req.DisplayName != nil && len(*req.DisplayName) > 30 {
		return nil, ErrInvalidInput
	}
	if req.Bio != nil && len(*req.Bio) > 500 {
		return nil, ErrInvalidInput
	}
	if req.Avatar != nil {
		parsed, err := url.Parse(*req.Avatar)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return nil, ErrInvalidInput
		}
	}

	updates := map[string]interface{}{}
	if req.DisplayName != nil {
		updates["display_name"] = *req.DisplayName
	}
	if req.Bio != nil {
		updates["bio"] = *req.Bio
	}
	if req.Avatar != nil {
		updates["avatar"] = *req.Avatar
	}

	if err := dal.DB.WithContext(ctx).Model(&model.User{}).Where("id = ?", userId).Updates(updates).Error; err != nil {
		return nil, err
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", userId).Error; err != nil {
		return nil, err
	}
	dto := mapper.UserToDTO(&user)
	return &dto, nil
}

// UpdateUserRole 修改用户角色（仅管理员可操作，不能修改自己的角色）
func (s *UserService) UpdateUserRole(ctx context.Context, username, role, currentUserId string) (*types.User, error) {
	if !validRoles[role] {
		return nil, ErrInvalidInput
	}

	var user model.User
	err := dal.DB.WithContext(ctx).Where("username = ?", username).First(&user).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	// 不能修改自己的角色（防止自我降权锁死）
	if user.ID == currentUserId {
		return nil, ErrCannotModifySelfRole
	}

	if err := dal.DB.WithContext(ctx).Model(&model.User{}).Where("id = ?", user.ID).Update("role", role).Error; err != nil {
		return nil, err
	}

	// 重新查询获取更新后的数据
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", user.ID).Error; err != nil {
		return nil, err
	}
	dto := mapper.UserToDTO(&user)
	return &dto, nil
}

// ========== Follow Module ==========

// FollowUser 关注某用户。created=true 表示新建关注(201)，false 表示已关注(200)
func (s *UserService) FollowUser(ctx context.Context, username, followerId string) (created bool, err error) {
	var target model.User
	err = dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&target).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, ErrUserNotFound
		}
		return false, err
	}
	if target.ID == followerId {
		return false, ErrCannotFollowSelf
	}

	// 是否已关注
	var existing model.Follow
	result := dal.DB.WithContext(ctx).
		Where("follower_id = ? AND following_id = ?", followerId, target.ID).
		First(&existing)
	if result.Error == nil {
		return false, nil
	}
	if result.Error != gorm.ErrRecordNotFound {
		return false, result.Error
	}

	// 创建关注，捕获并发下的唯一约束冲突
	follow := &model.Follow{FollowerID: followerId, FollowingID: target.ID}
	if err := dal.DB.WithContext(ctx).Create(follow).Error; err != nil {
		if notification.IsUniqueConstraintError(err) {
			return false, nil
		}
		return false, err
	}

	// 通知被关注者
	notification.Create(ctx, notification.CreateInput{
		UserID:  target.ID,
		Type:    "follow",
		ActorID: followerId,
	})

	return true, nil
}

// UnfollowUser 取消关注（幂等）
func (s *UserService) UnfollowUser(ctx context.Context, username, followerId string) error {
	var target model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&target).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrUserNotFound
		}
		return err
	}

	dal.DB.WithContext(ctx).
		Where("follower_id = ? AND following_id = ?", followerId, target.ID).
		Delete(&model.Follow{})
	return nil
}

// ListFollowing 分页获取某用户的关注列表
func (s *UserService) ListFollowing(ctx context.Context, username, currentUserId string, page, pageSize int) (*types.Paginated[types.PublicUser], error) {
	var u model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	var total int64
	dal.DB.WithContext(ctx).Model(&model.Follow{}).Where("follower_id = ?", u.ID).Count(&total)

	var follows []model.Follow
	dal.DB.WithContext(ctx).
		Preload("Following").
		Where("follower_id = ?", u.ID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&follows)

	users := make([]model.User, 0, len(follows))
	for _, f := range follows {
		users = append(users, f.Following)
	}

	items := s.mapUsersToPublic(ctx, users, currentUserId)

	return &types.Paginated[types.PublicUser]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ListFollowers 分页获取某用户的粉丝列表
func (s *UserService) ListFollowers(ctx context.Context, username, currentUserId string, page, pageSize int) (*types.Paginated[types.PublicUser], error) {
	var u model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	var total int64
	dal.DB.WithContext(ctx).Model(&model.Follow{}).Where("following_id = ?", u.ID).Count(&total)

	var follows []model.Follow
	dal.DB.WithContext(ctx).
		Preload("Follower").
		Where("following_id = ?", u.ID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&follows)

	users := make([]model.User, 0, len(follows))
	for _, f := range follows {
		users = append(users, f.Follower)
	}

	items := s.mapUsersToPublic(ctx, users, currentUserId)

	return &types.Paginated[types.PublicUser]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ========== Bookmark Module ==========

// BookmarkPost 收藏帖子。created=true 表示新建收藏(201)，false 表示已收藏(200)
func (s *UserService) BookmarkPost(ctx context.Context, postID, userId string) (created bool, bookmarkCount int, err error) {
	var post model.Post
	err = dal.DB.WithContext(ctx).Select("id").First(&post, "id = ?", postID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, 0, ErrPostNotFound
		}
		return false, 0, err
	}

	// 是否已收藏
	var existing model.Bookmark
	result := dal.DB.WithContext(ctx).
		Where("post_id = ? AND user_id = ?", postID, userId).
		First(&existing)
	if result.Error == nil {
		var count int64
		dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count)
		return false, int(count), nil
	}
	if result.Error != gorm.ErrRecordNotFound {
		return false, 0, result.Error
	}

	bookmark := &model.Bookmark{PostID: postID, UserID: userId}
	if err := dal.DB.WithContext(ctx).Create(bookmark).Error; err != nil {
		if notification.IsUniqueConstraintError(err) {
			var count int64
			dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count)
			return false, int(count), nil
		}
		return false, 0, err
	}

	var count int64
	dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count)
	return true, int(count), nil
}

// UnbookmarkPost 取消收藏（幂等）
func (s *UserService) UnbookmarkPost(ctx context.Context, postID, userId string) (bookmarkCount int, err error) {
	var post model.Post
	err = dal.DB.WithContext(ctx).Select("id").First(&post, "id = ?", postID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, ErrPostNotFound
		}
		return 0, err
	}

	dal.DB.WithContext(ctx).
		Where("post_id = ? AND user_id = ?", postID, userId).
		Delete(&model.Bookmark{})

	var count int64
	dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count)
	return int(count), nil
}

// ListBookmarks 分页获取当前用户的收藏列表
func (s *UserService) ListBookmarks(ctx context.Context, userId string, page, pageSize int) (*types.Paginated[types.Post], error) {
	bookmarkSubquery := dal.DB.WithContext(ctx).
		Model(&model.Bookmark{}).
		Select("post_id").
		Where("user_id = ?", userId)

	var total int64
	dal.DB.WithContext(ctx).Model(&model.Post{}).Where("id IN (?)", bookmarkSubquery).Count(&total)

	var posts []model.Post
	dal.DB.WithContext(ctx).
		Preload("Author").Preload("Tags").
		Where("id IN (?)", bookmarkSubquery).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&posts)

	items := s.mapPostsToDTO(ctx, posts, userId)

	return &types.Paginated[types.Post]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ========== 批量统计辅助 ==========

// userStats 单个用户的公开统计
type userStats struct {
	PostCount      int
	FollowerCount  int
	FollowingCount int
	IsFollowing    bool
}

// groupCountRow GROUP BY 聚合的通用结果行
type groupCountRow struct {
	ID    string `gorm:"column:id"`
	Count int    `gorm:"column:count"`
}

// batchPublicUserStats 批量计算一组用户的 postCount/followerCount/followingCount 及当前用户是否关注。
// 用 GROUP BY 聚合 + 单次 findMany 查 isFollowing，消除 N+1 查询。
func (s *UserService) batchPublicUserStats(ctx context.Context, userIDs []string, currentUserId string) map[string]userStats {
	result := make(map[string]userStats)
	if len(userIDs) == 0 {
		return result
	}

	// 帖子数
	var postRows []groupCountRow
	dal.DB.WithContext(ctx).Model(&model.Post{}).
		Select("author_id as id, count(*) as count").
		Where("author_id IN ?", userIDs).
		Group("author_id").
		Scan(&postRows)
	postMap := make(map[string]int, len(postRows))
	for _, r := range postRows {
		postMap[r.ID] = r.Count
	}

	// 粉丝数（被关注者维度）
	var followerRows []groupCountRow
	dal.DB.WithContext(ctx).Model(&model.Follow{}).
		Select("following_id as id, count(*) as count").
		Where("following_id IN ?", userIDs).
		Group("following_id").
		Scan(&followerRows)
	followerMap := make(map[string]int, len(followerRows))
	for _, r := range followerRows {
		followerMap[r.ID] = r.Count
	}

	// 关注数（关注者维度）
	var followingRows []groupCountRow
	dal.DB.WithContext(ctx).Model(&model.Follow{}).
		Select("follower_id as id, count(*) as count").
		Where("follower_id IN ?", userIDs).
		Group("follower_id").
		Scan(&followingRows)
	followingMap := make(map[string]int, len(followingRows))
	for _, r := range followingRows {
		followingMap[r.ID] = r.Count
	}

	// 当前用户对这批用户的关注关系
	followingSet := make(map[string]bool)
	if currentUserId != "" {
		var follows []model.Follow
		dal.DB.WithContext(ctx).
			Select("following_id").
			Where("follower_id = ? AND following_id IN ?", currentUserId, userIDs).
			Find(&follows)
		for _, f := range follows {
			followingSet[f.FollowingID] = true
		}
	}

	for _, id := range userIDs {
		result[id] = userStats{
			PostCount:      postMap[id],
			FollowerCount:  followerMap[id],
			FollowingCount: followingMap[id],
			IsFollowing:    followingSet[id],
		}
	}
	return result
}

// mapUsersToPublic 将一批用户 + 统计映射为 PublicUser DTO 列表
func (s *UserService) mapUsersToPublic(ctx context.Context, users []model.User, currentUserId string) []types.PublicUser {
	if len(users) == 0 {
		return []types.PublicUser{}
	}
	userIDs := make([]string, 0, len(users))
	for _, u := range users {
		userIDs = append(userIDs, u.ID)
	}
	stats := s.batchPublicUserStats(ctx, userIDs, currentUserId)

	items := make([]types.PublicUser, 0, len(users))
	for i := range users {
		u := &users[i]
		st := stats[u.ID]
		items = append(items, mapper.PublicUserToDTO(u, st.PostCount, st.FollowerCount, st.FollowingCount, st.IsFollowing))
	}
	return items
}

// mapPostsToDTO 将帖子列表映射为 Post DTO，批量填充 commentCount / liked / bookmarked / tags
func (s *UserService) mapPostsToDTO(ctx context.Context, posts []model.Post, currentUserId string) []types.Post {
	if len(posts) == 0 {
		return []types.Post{}
	}
	postIDs := make([]string, 0, len(posts))
	for _, p := range posts {
		postIDs = append(postIDs, p.ID)
	}

	commentCountMap := s.batchCommentCounts(ctx, postIDs)
	likedSet := s.batchLikedPostIDs(ctx, postIDs, currentUserId)
	bookmarkedSet := s.batchBookmarkedPostIDs(ctx, postIDs, currentUserId)

	items := make([]types.Post, 0, len(posts))
	for i := range posts {
		p := &posts[i]
		dto := mapper.PostToDTO(
			p,
			commentCountMap[p.ID],
			likedSet[p.ID],
			bookmarkedSet[p.ID],
			mapper.ExtractTagNames(p.Tags),
		)
		items = append(items, dto)
	}
	return items
}

// batchCommentCounts 批量查询一组帖子的评论数
func (s *UserService) batchCommentCounts(ctx context.Context, postIDs []string) map[string]int {
	result := make(map[string]int)
	if len(postIDs) == 0 {
		return result
	}
	var rows []groupCountRow
	dal.DB.WithContext(ctx).Model(&model.Comment{}).
		Select("post_id as id, count(*) as count").
		Where("post_id IN ?", postIDs).
		Group("post_id").
		Scan(&rows)
	for _, r := range rows {
		result[r.ID] = r.Count
	}
	return result
}

// batchLikedPostIDs 批量查询当前用户对一组帖子的点赞状态
func (s *UserService) batchLikedPostIDs(ctx context.Context, postIDs []string, userId string) map[string]bool {
	result := make(map[string]bool)
	if userId == "" || len(postIDs) == 0 {
		return result
	}
	var likes []model.PostLike
	dal.DB.WithContext(ctx).
		Select("post_id").
		Where("post_id IN ? AND user_id = ?", postIDs, userId).
		Find(&likes)
	for _, l := range likes {
		result[l.PostID] = true
	}
	return result
}

// batchBookmarkedPostIDs 批量查询当前用户对一组帖子的收藏状态
func (s *UserService) batchBookmarkedPostIDs(ctx context.Context, postIDs []string, userId string) map[string]bool {
	result := make(map[string]bool)
	if userId == "" || len(postIDs) == 0 {
		return result
	}
	var bookmarks []model.Bookmark
	dal.DB.WithContext(ctx).
		Select("post_id").
		Where("post_id IN ? AND user_id = ?", postIDs, userId).
		Find(&bookmarks)
	for _, b := range bookmarks {
		result[b.PostID] = true
	}
	return result
}
