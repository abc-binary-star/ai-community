package service

import (
	"context"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"golang.org/x/crypto/bcrypt"
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

// AdminUserSearchItem 角色管理用搜索项（仅管理员可见，含邮箱便于区分同名用户）
type AdminUserSearchItem struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	Avatar      *string   `json:"avatar"`
	DisplayName *string   `json:"displayName"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
}

// ServiceError 业务错误，携带 HTTP 状态码
type ServiceError struct {
	Msg  string
	Code int
}

func (e *ServiceError) Error() string { return e.Msg }

// ErrUserNotFound / ErrPostNotFound 复用 auth.go 与 comment.go 中已声明的同名错误
var (
	ErrCannotFollowSelf     = &ServiceError{Msg: "不能关注自己", Code: 400}
	ErrInvalidInput         = &ServiceError{Msg: "输入不合法", Code: 400}
	ErrCannotModifySelfRole = &ServiceError{Msg: "不能修改自己的角色", Code: 400}
	ErrCannotBlockSelf      = &ServiceError{Msg: "不能屏蔽自己", Code: 400}
)

// validRoles 允许的用户角色
var validRoles = map[string]bool{
	"user":      true,
	"moderator": true,
	"admin":     true,
}

// blockedUserIDs 返回当前用户屏蔽的用户 ID 集合
func blockedUserIDs(ctx context.Context, userID string) map[string]bool {
	result := make(map[string]bool)
	if userID == "" {
		return result
	}
	var blocks []model.Block
	dal.DB.WithContext(ctx).
		Select("blocked_id").
		Where("blocker_id = ?", userID).
		Find(&blocks)
	for _, b := range blocks {
		result[b.BlockedID] = true
	}
	return result
}

// blockedIDList 返回当前用户屏蔽的用户 ID 切片（供 NOT IN 过滤使用）
func blockedIDList(ctx context.Context, userID string) []string {
	set := blockedUserIDs(ctx, userID)
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	return ids
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

// SearchUsersAdmin 角色管理用搜索：按邮箱或用户名模糊匹配（两者均唯一，
// 昵称 display_name 可重复故不参与），返回含角色与邮箱的完整信息（仅管理员调用）。
func (s *UserService) SearchUsersAdmin(ctx context.Context, q string) ([]AdminUserSearchItem, error) {
	q = strings.TrimSpace(q)
	if len(q) < 1 {
		return []AdminUserSearchItem{}, nil
	}
	like := "%" + q + "%"
	var users []model.User
	if err := dal.DB.WithContext(ctx).
		Where("username ILIKE ? OR email ILIKE ?", like, like).
		Order("created_at ASC").
		Limit(20).
		Find(&users).Error; err != nil {
		return nil, err
	}
	items := make([]AdminUserSearchItem, 0, len(users))
	for _, u := range users {
		items = append(items, AdminUserSearchItem{
			ID:          u.ID,
			Username:    u.Username,
			Avatar:      u.Avatar,
			DisplayName: u.DisplayName,
			Email:       u.Email,
			Role:        u.Role,
			CreatedAt:   u.CreatedAt,
		})
	}
	return items, nil
}

// ListUsers 分页浏览全部用户（仅管理员调用），支持可选关键词过滤
func (s *UserService) ListUsers(ctx context.Context, q string, page, pageSize int) (*types.Paginated[AdminUserSearchItem], error) {
	query := dal.DB.WithContext(ctx).Model(&model.User{})

	if q = strings.TrimSpace(q); q != "" {
		like := "%" + q + "%"
		query = query.Where("username ILIKE ? OR email ILIKE ? OR display_name ILIKE ?", like, like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	var users []model.User
	if err := query.
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&users).Error; err != nil {
		return nil, err
	}

	items := make([]AdminUserSearchItem, 0, len(users))
	for _, u := range users {
		items = append(items, AdminUserSearchItem{
			ID:          u.ID,
			Username:    u.Username,
			Avatar:      u.Avatar,
			DisplayName: u.DisplayName,
			Email:       u.Email,
			Role:        u.Role,
			CreatedAt:   u.CreatedAt,
		})
	}

	return &types.Paginated[AdminUserSearchItem]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// GetUser 查看用户主页（公开），批量计算统计与关注状态
func (s *UserService) GetUser(ctx context.Context, username, currentUserId string) (*types.PublicUser, error) {
	var u model.User
	err := dal.DB.WithContext(ctx).Where("username = ?", username).First(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		log.Printf("[User/GetUser] 查询用户失败, username=%s, err=%v", username, err)
		return nil, err
	}

	var postCount, followerCount, followingCount, likeCount int64
	isFollowing := false
	var channels []string

	var wg sync.WaitGroup
	var postErr, followerErr, followingErr, isFollowingErr, likeErr, channelErr error
	wg.Add(6)

	go func() {
		defer wg.Done()
		postErr = dal.DB.WithContext(ctx).Model(&model.Post{}).Where("author_id = ?", u.ID).Count(&postCount).Error
	}()
	go func() {
		defer wg.Done()
		followerErr = dal.DB.WithContext(ctx).Model(&model.Follow{}).Where("following_id = ?", u.ID).Count(&followerCount).Error
	}()
	go func() {
		defer wg.Done()
		followingErr = dal.DB.WithContext(ctx).Model(&model.Follow{}).Where("follower_id = ?", u.ID).Count(&followingCount).Error
	}()
	go func() {
		defer wg.Done()
		if currentUserId != "" {
			var cnt int64
			isFollowingErr = dal.DB.WithContext(ctx).Model(&model.Follow{}).
				Where("follower_id = ? AND following_id = ?", currentUserId, u.ID).
				Count(&cnt).Error
			isFollowing = cnt > 0
		}
	}()
	go func() {
		defer wg.Done()
		// 获赞总数：该用户所有帖子的 like_count 之和
		likeErr = dal.DB.WithContext(ctx).Model(&model.Post{}).
			Where("author_id = ? AND status = ?", u.ID, "published").
			Select("COALESCE(SUM(like_count), 0)").Scan(&likeCount).Error
	}()
	go func() {
		defer wg.Done()
		// 参与的频道列表（去重）
		channelErr = dal.DB.WithContext(ctx).Model(&model.Post{}).
			Where("author_id = ? AND status = ?", u.ID, "published").
			Distinct("channel").
			Pluck("channel", &channels).Error
	}()
	wg.Wait()

	if postErr != nil {
		log.Printf("[User/GetUser] 查询帖子数失败, userID=%s, err=%v", u.ID, postErr)
		return nil, postErr
	}
	if followerErr != nil {
		log.Printf("[User/GetUser] 查询粉丝数失败, userID=%s, err=%v", u.ID, followerErr)
		return nil, followerErr
	}
	if followingErr != nil {
		log.Printf("[User/GetUser] 查询关注数失败, userID=%s, err=%v", u.ID, followingErr)
		return nil, followingErr
	}
	if isFollowingErr != nil {
		log.Printf("[User/GetUser] 查询关注状态失败, currentUserId=%s, targetID=%s, err=%v", currentUserId, u.ID, isFollowingErr)
		return nil, isFollowingErr
	}
	if likeErr != nil {
		log.Printf("[User/GetUser] 查询获赞数失败, userID=%s, err=%v", u.ID, likeErr)
		return nil, likeErr
	}
	if channelErr != nil {
		log.Printf("[User/GetUser] 查询频道列表失败, userID=%s, err=%v", u.ID, channelErr)
		return nil, channelErr
	}

	dto := mapper.PublicUserToDTO(&u, int(postCount), int(followerCount), int(followingCount), int(likeCount), channels, isFollowing)
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
		log.Printf("[User/GetUserPosts] 查询用户失败, username=%s, err=%v", username, err)
		return nil, err
	}

	var total int64
	dal.DB.WithContext(ctx).Model(&model.Post{}).Where("author_id = ? AND status = ?", u.ID, "published").Count(&total)

	var posts []model.Post
	dal.DB.WithContext(ctx).
		Preload("Author").Preload("Tags").
		Where("author_id = ? AND status = ?", u.ID, "published").
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
	if req.DisplayName != nil && len([]rune(*req.DisplayName)) > 30 {
		return nil, ErrInvalidInput
	}
	if req.Bio != nil && len([]rune(*req.Bio)) > 500 {
		return nil, ErrInvalidInput
	}
	if req.Avatar != nil {
		parsed, err := url.Parse(*req.Avatar)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return nil, ErrInvalidInput
		}
	}

	// TODO: 当前 *string 无法区分"未提供"与"设为 null"。
	// 前端目前不通过 API 清空字段，暂不影响使用。
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
		log.Printf("[User/UpdateUser] 更新用户资料失败, userId=%s, err=%v", userId, err)
		return nil, err
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", userId).Error; err != nil {
		log.Printf("[User/UpdateUser] 重新查询用户失败, userId=%s, err=%v", userId, err)
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
		log.Printf("[User/UpdateUserRole] 查询用户失败, username=%s, err=%v", username, err)
		return nil, err
	}

	// 不能修改自己的角色（防止自我降权锁死）
	if user.ID == currentUserId {
		return nil, ErrCannotModifySelfRole
	}

	if err := dal.DB.WithContext(ctx).Model(&model.User{}).Where("id = ?", user.ID).Update("role", role).Error; err != nil {
		log.Printf("[User/UpdateUserRole] 更新用户角色失败, userID=%s, role=%s, err=%v", user.ID, role, err)
		return nil, err
	}

	// 重新查询获取更新后的数据
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", user.ID).Error; err != nil {
		log.Printf("[User/UpdateUserRole] 重新查询用户失败, userID=%s, err=%v", user.ID, err)
		return nil, err
	}
	dto := mapper.UserToDTO(&user)
	return &dto, nil
}

// ResetPassword 管理员重置指定用户密码（仅管理员可调用）。
// 新密码按注册逻辑用 bcrypt 哈希后落库，任何入口都无法还原明文。
func (s *UserService) ResetPassword(ctx context.Context, username, newPassword string) error {
	var user model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&user).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrUserNotFound
		}
		log.Printf("[User/ResetPassword] 查询用户失败, username=%s, err=%v", username, err)
		return err
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		log.Printf("[User/ResetPassword] 生成密码哈希失败, userID=%s, err=%v", user.ID, err)
		return err
	}

	if err := dal.DB.WithContext(ctx).Model(&model.User{}).
		Where("id = ?", user.ID).
		Update("password", string(hashed)).Error; err != nil {
		log.Printf("[User/ResetPassword] 重置密码失败, userID=%s, err=%v", user.ID, err)
		return err
	}
	return nil
}

// BanUser 封禁或解禁用户。action="ban" 永久封禁，action="unban" 解除生效处罚并恢复。
// 为兼容旧接口保留签名；实际处罚委托 SanctionService 落审计记录，不再裸改状态。
func (s *UserService) BanUser(ctx context.Context, username, action, handlerID string) (string, error) {
	ss := &SanctionService{}
	if action == "ban" {
		if _, err := ss.ApplySanction(ctx, types.ApplySanctionReq{
			Username: username,
			Action:   model.ModerationActionBan,
		}, handlerID); err != nil {
			return "", err
		}
		return model.UserStatusBanned, nil
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return "", ErrUserNotFound
		}
		return "", err
	}
	var rec model.ModerationAction
	err := dal.DB.WithContext(ctx).
		Where("user_id = ? AND action = ? AND status = ?", user.ID, model.ModerationActionBan, model.ModerationActionActive).
		Order("created_at DESC").
		First(&rec).Error
	if err == gorm.ErrRecordNotFound {
		// 无生效封禁记录时也恢复账号状态，兼容历史裸改数据
		if err := dal.DB.WithContext(ctx).Model(&model.User{}).Where("id = ?", user.ID).Update("status", model.UserStatusActive).Error; err != nil {
			return "", err
		}
		return model.UserStatusActive, nil
	}
	if err != nil {
		return "", err
	}
	if _, err := ss.RevokeSanction(ctx, rec.ID, handlerID); err != nil {
		return "", err
	}
	return model.UserStatusActive, nil
}

// ========== Follow Module ==========

// FollowUser 关注某用户。created=true 表示新建关注(201)，false 表示已关注(200)
func (s *UserService) FollowUser(ctx context.Context, username, followerId, groupId string) (created bool, err error) {
	var target model.User
	err = dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&target).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, ErrUserNotFound
		}
		log.Printf("[User/FollowUser] 查询目标用户失败, username=%s, err=%v", username, err)
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
		// 已关注：如果传了 groupId 则更新分组
		if groupId != "" && (existing.GroupID == nil || *existing.GroupID != groupId) {
			dal.DB.WithContext(ctx).Model(&existing).Update("group_id", groupId)
		}
		return false, nil
	}
	if result.Error != gorm.ErrRecordNotFound {
		log.Printf("[User/FollowUser] 查询已有关注记录失败, followerId=%s, targetID=%s, err=%v", followerId, target.ID, result.Error)
		return false, result.Error
	}

	// 创建关注，捕获并发下的唯一约束冲突
	follow := &model.Follow{FollowerID: followerId, FollowingID: target.ID}
	if groupId != "" {
		follow.GroupID = &groupId
	}
	if err := dal.DB.WithContext(ctx).Create(follow).Error; err != nil {
		if notification.IsUniqueConstraintError(err) {
			return false, nil
		}
		log.Printf("[User/FollowUser] 创建关注记录失败, followerId=%s, targetID=%s, err=%v", followerId, target.ID, err)
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
		log.Printf("[User/UnfollowUser] 查询目标用户失败, username=%s, err=%v", username, err)
		return err
	}

	if err := dal.DB.WithContext(ctx).
		Where("follower_id = ? AND following_id = ?", followerId, target.ID).
		Delete(&model.Follow{}).Error; err != nil {
		log.Printf("[User/UnfollowUser] 删除关注记录失败, followerId=%s, targetID=%s, err=%v", followerId, target.ID, err)
		return err
	}
	return nil
}

// ========== Block Module ==========

// BlockUser 屏蔽用户（幂等）。created=true 表示新建屏蔽(201)，false 表示已屏蔽(200)
func (s *UserService) BlockUser(ctx context.Context, blockerID, blockedUsername string) (created bool, err error) {
	var target model.User
	err = dal.DB.WithContext(ctx).Select("id").Where("username = ?", blockedUsername).First(&target).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, ErrUserNotFound
		}
		log.Printf("[User/BlockUser] 查询目标用户失败, blockedUsername=%s, err=%v", blockedUsername, err)
		return false, err
	}
	if target.ID == blockerID {
		return false, ErrCannotBlockSelf
	}

	// 是否已屏蔽
	var existing model.Block
	result := dal.DB.WithContext(ctx).
		Where("blocker_id = ? AND blocked_id = ?", blockerID, target.ID).
		First(&existing)
	if result.Error == nil {
		return false, nil
	}
	if result.Error != gorm.ErrRecordNotFound {
		log.Printf("[User/BlockUser] 查询已有屏蔽记录失败, blockerID=%s, targetID=%s, err=%v", blockerID, target.ID, result.Error)
		return false, result.Error
	}

	block := &model.Block{BlockerID: blockerID, BlockedID: target.ID}
	if err := dal.DB.WithContext(ctx).Create(block).Error; err != nil {
		if notification.IsUniqueConstraintError(err) {
			return false, nil
		}
		log.Printf("[User/BlockUser] 创建屏蔽记录失败, blockerID=%s, targetID=%s, err=%v", blockerID, target.ID, err)
		return false, err
	}
	return true, nil
}

// UnblockUser 解除屏蔽（幂等）
func (s *UserService) UnblockUser(ctx context.Context, blockerID, blockedUsername string) error {
	var target model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", blockedUsername).First(&target).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrUserNotFound
		}
		log.Printf("[User/UnblockUser] 查询目标用户失败, blockedUsername=%s, err=%v", blockedUsername, err)
		return err
	}

	dal.DB.WithContext(ctx).
		Where("blocker_id = ? AND blocked_id = ?", blockerID, target.ID).
		Delete(&model.Block{})
	return nil
}

// ListBlockedUsers 分页获取当前用户的屏蔽列表
func (s *UserService) ListBlockedUsers(ctx context.Context, blockerID string, page, pageSize int) (*types.Paginated[types.PublicUser], error) {
	var total int64
	dal.DB.WithContext(ctx).Model(&model.Block{}).Where("blocker_id = ?", blockerID).Count(&total)

	var blocks []model.Block
	dal.DB.WithContext(ctx).
		Preload("Blocked").
		Where("blocker_id = ?", blockerID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&blocks)

	users := make([]model.User, 0, len(blocks))
	for _, b := range blocks {
		users = append(users, b.Blocked)
	}

	items := s.mapUsersToPublic(ctx, users, blockerID)

	return &types.Paginated[types.PublicUser]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// IsBlocked 查询当前用户是否已屏蔽目标用户
func (s *UserService) IsBlocked(ctx context.Context, blockerID, username string) (bool, error) {
	if blockerID == "" {
		return false, nil
	}
	var target model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&target).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, ErrUserNotFound
		}
		log.Printf("[User/IsBlocked] 查询目标用户失败, username=%s, err=%v", username, err)
		return false, err
	}
	var cnt int64
	dal.DB.WithContext(ctx).Model(&model.Block{}).
		Where("blocker_id = ? AND blocked_id = ?", blockerID, target.ID).
		Count(&cnt)
	return cnt > 0, nil
}

// ListFollowing 分页获取某用户的关注列表
func (s *UserService) ListFollowing(ctx context.Context, username, currentUserId string, page, pageSize int) (*types.Paginated[types.PublicUser], error) {
	var u model.User
	err := dal.DB.WithContext(ctx).Select("id").Where("username = ?", username).First(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		log.Printf("[User/ListFollowing] 查询用户失败, username=%s, err=%v", username, err)
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
		log.Printf("[User/ListFollowers] 查询用户失败, username=%s, err=%v", username, err)
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
func (s *UserService) BookmarkPost(ctx context.Context, postID, userId, folderId string) (created bool, bookmarkCount int, err error) {
	var post model.Post
	err = dal.DB.WithContext(ctx).Select("id").First(&post, "id = ?", postID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, 0, ErrPostNotFound
		}
		log.Printf("[User/BookmarkPost] 查询帖子失败, postID=%s, err=%v", postID, err)
		return false, 0, err
	}

	// 是否已收藏
	var existing model.Bookmark
	result := dal.DB.WithContext(ctx).
		Where("post_id = ? AND user_id = ?", postID, userId).
		First(&existing)
	if result.Error == nil {
		// 已收藏：如果传了 folderId 则更新归属
		if folderId != "" && (existing.FolderID == nil || *existing.FolderID != folderId) {
			dal.DB.WithContext(ctx).Model(&existing).Update("folder_id", folderId)
		}
		var count int64
		dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count)
		return false, int(count), nil
	}
	if result.Error != gorm.ErrRecordNotFound {
		log.Printf("[User/BookmarkPost] 查询已有收藏记录失败, postID=%s, userId=%s, err=%v", postID, userId, result.Error)
		return false, 0, result.Error
	}

	bookmark := &model.Bookmark{PostID: postID, UserID: userId}
	if folderId != "" {
		bookmark.FolderID = &folderId
	}
	if err := dal.DB.WithContext(ctx).Create(bookmark).Error; err != nil {
		if notification.IsUniqueConstraintError(err) {
			var count int64
			dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count)
			return false, int(count), nil
		}
		log.Printf("[User/BookmarkPost] 创建收藏记录失败, postID=%s, userId=%s, err=%v", postID, userId, err)
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
		log.Printf("[User/UnbookmarkPost] 查询帖子失败, postID=%s, err=%v", postID, err)
		return 0, err
	}

	if err := dal.DB.WithContext(ctx).
		Where("post_id = ? AND user_id = ?", postID, userId).
		Delete(&model.Bookmark{}).Error; err != nil {
		log.Printf("[User/UnbookmarkPost] 删除收藏记录失败, postID=%s, userId=%s, err=%v", postID, userId, err)
		return 0, err
	}

	var count int64
	if err := dal.DB.WithContext(ctx).Model(&model.Bookmark{}).Where("post_id = ?", postID).Count(&count).Error; err != nil {
		log.Printf("[User/UnbookmarkPost] 查询收藏数失败, postID=%s, err=%v", postID, err)
		return 0, err
	}
	return int(count), nil
}

// ListBookmarks 分页获取当前用户的收藏列表，支持按收藏夹筛选
func (s *UserService) ListBookmarks(ctx context.Context, userId string, folderId string, page, pageSize int) (*types.Paginated[types.Post], error) {
	bookmarkSubquery := dal.DB.WithContext(ctx).
		Model(&model.Bookmark{}).
		Select("post_id").
		Where("user_id = ?", userId)
	if folderId == "uncategorized" {
		bookmarkSubquery = bookmarkSubquery.Where("folder_id IS NULL")
	} else if folderId != "" {
		bookmarkSubquery = bookmarkSubquery.Where("folder_id = ?", folderId)
	}

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
	LikeCount      int
	Channels       []string
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

	// 获赞总数（批量）
	type likeRow struct {
		ID    string `gorm:"column:author_id"`
		Likes int    `gorm:"column:sum_likes"`
	}
	var likeRows []likeRow
	dal.DB.WithContext(ctx).Model(&model.Post{}).
		Select("author_id, COALESCE(SUM(like_count), 0) as sum_likes").
		Where("author_id IN ? AND status = ?", userIDs, "published").
		Group("author_id").
		Scan(&likeRows)
	likeMap := make(map[string]int, len(likeRows))
	for _, r := range likeRows {
		likeMap[r.ID] = r.Likes
	}

	// 频道列表（批量：每个用户的 distinct channel）
	type channelRow struct {
		ID      string `gorm:"column:author_id"`
		Channel string `gorm:"column:channel"`
	}
	var channelRows []channelRow
	dal.DB.WithContext(ctx).Model(&model.Post{}).
		Select("author_id, channel").
		Where("author_id IN ? AND status = ?", userIDs, "published").
		Distinct("author_id, channel").
		Scan(&channelRows)
	channelMap := make(map[string][]string)
	for _, r := range channelRows {
		channelMap[r.ID] = append(channelMap[r.ID], r.Channel)
	}

	for _, id := range userIDs {
		ch := channelMap[id]
		if ch == nil {
			ch = []string{}
		}
		result[id] = userStats{
			PostCount:      postMap[id],
			FollowerCount:  followerMap[id],
			FollowingCount: followingMap[id],
			LikeCount:      likeMap[id],
			Channels:       ch,
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
		items = append(items, mapper.PublicUserToDTO(u, st.PostCount, st.FollowerCount, st.FollowingCount, st.LikeCount, st.Channels, st.IsFollowing))
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
		dto := mapper.PostToListDTO(
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

// ========== Bookmark Folder Module ==========

// ListBookmarkFolders 获取用户的收藏夹列表
func (s *UserService) ListBookmarkFolders(ctx context.Context, userId string) ([]types.BookmarkFolder, error) {
	var folders []model.BookmarkFolder
	dal.DB.WithContext(ctx).
		Where("user_id = ?", userId).
		Order("created_at ASC").
		Find(&folders)

	items := make([]types.BookmarkFolder, 0, len(folders))
	for _, f := range folders {
		items = append(items, types.BookmarkFolder{
			ID:        f.ID,
			Name:      f.Name,
			CreatedAt: f.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return items, nil
}

// CreateBookmarkFolder 创建收藏夹
func (s *UserService) CreateBookmarkFolder(ctx context.Context, userId, name string) (*types.BookmarkFolder, error) {
	folder := &model.BookmarkFolder{Name: name, UserID: userId}
	if err := dal.DB.WithContext(ctx).Create(folder).Error; err != nil {
		log.Printf("[BookmarkFolder/Create] 创建失败, userId=%s, err=%v", userId, err)
		return nil, err
	}
	dto := types.BookmarkFolder{
		ID:        folder.ID,
		Name:      folder.Name,
		CreatedAt: folder.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return &dto, nil
}

// UpdateBookmarkFolder 更新收藏夹名称
func (s *UserService) UpdateBookmarkFolder(ctx context.Context, folderId, userId, name string) (*types.BookmarkFolder, error) {
	result := dal.DB.WithContext(ctx).
		Model(&model.BookmarkFolder{}).
		Where("id = ? AND user_id = ?", folderId, userId).
		Update("name", name)
	if result.Error != nil {
		log.Printf("[BookmarkFolder/Update] 更新失败, folderId=%s, err=%v", folderId, result.Error)
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, &ServiceError{Msg: "收藏夹不存在", Code: 404}
	}

	var folder model.BookmarkFolder
	dal.DB.WithContext(ctx).First(&folder, "id = ?", folderId)
	dto := types.BookmarkFolder{
		ID:        folder.ID,
		Name:      folder.Name,
		CreatedAt: folder.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return &dto, nil
}

// DeleteBookmarkFolder 删除收藏夹（收藏记录的 folder_id 置为 NULL）
func (s *UserService) DeleteBookmarkFolder(ctx context.Context, folderId, userId string) error {
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.
			Where("id = ? AND user_id = ?", folderId, userId).
			Delete(&model.BookmarkFolder{})
		if result.Error != nil {
			log.Printf("[BookmarkFolder/Delete] 删除失败, folderId=%s, err=%v", folderId, result.Error)
			return result.Error
		}
		if result.RowsAffected == 0 {
			return &ServiceError{Msg: "收藏夹不存在", Code: 404}
		}
		// 解除收藏记录的关联
		return tx.Model(&model.Bookmark{}).
			Where("user_id = ? AND folder_id = ?", userId, folderId).
			Update("folder_id", nil).Error
	})
}

// ========== Follow Group Module ==========

// ListFollowGroups 获取用户的关注分组列表
func (s *UserService) ListFollowGroups(ctx context.Context, userId string) ([]types.FollowGroup, error) {
	var groups []model.FollowGroup
	dal.DB.WithContext(ctx).
		Where("user_id = ?", userId).
		Order("created_at ASC").
		Find(&groups)

	items := make([]types.FollowGroup, 0, len(groups))
	for _, g := range groups {
		items = append(items, types.FollowGroup{
			ID:        g.ID,
			Name:      g.Name,
			CreatedAt: g.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return items, nil
}

// CreateFollowGroup 创建关注分组
func (s *UserService) CreateFollowGroup(ctx context.Context, userId, name string) (*types.FollowGroup, error) {
	group := &model.FollowGroup{Name: name, UserID: userId}
	if err := dal.DB.WithContext(ctx).Create(group).Error; err != nil {
		log.Printf("[FollowGroup/Create] 创建失败, userId=%s, err=%v", userId, err)
		return nil, err
	}
	dto := types.FollowGroup{
		ID:        group.ID,
		Name:      group.Name,
		CreatedAt: group.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return &dto, nil
}

// UpdateFollowGroup 更新关注分组名称
func (s *UserService) UpdateFollowGroup(ctx context.Context, groupId, userId, name string) (*types.FollowGroup, error) {
	result := dal.DB.WithContext(ctx).
		Model(&model.FollowGroup{}).
		Where("id = ? AND user_id = ?", groupId, userId).
		Update("name", name)
	if result.Error != nil {
		log.Printf("[FollowGroup/Update] 更新失败, groupId=%s, err=%v", groupId, result.Error)
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, &ServiceError{Msg: "分组不存在", Code: 404}
	}

	var group model.FollowGroup
	dal.DB.WithContext(ctx).First(&group, "id = ?", groupId)
	dto := types.FollowGroup{
		ID:        group.ID,
		Name:      group.Name,
		CreatedAt: group.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return &dto, nil
}

// DeleteFollowGroup 删除关注分组（关注记录的 group_id 置为 NULL）
func (s *UserService) DeleteFollowGroup(ctx context.Context, groupId, userId string) error {
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.
			Where("id = ? AND user_id = ?", groupId, userId).
			Delete(&model.FollowGroup{})
		if result.Error != nil {
			log.Printf("[FollowGroup/Delete] 删除失败, groupId=%s, err=%v", groupId, result.Error)
			return result.Error
		}
		if result.RowsAffected == 0 {
			return &ServiceError{Msg: "分组不存在", Code: 404}
		}
		// 解除关注记录的关联
		return tx.Model(&model.Follow{}).
			Where("follower_id = ? AND group_id = ?", userId, groupId).
			Update("group_id", nil).Error
	})
}
