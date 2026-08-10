package handler

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var userService = &service.UserService{}

// handleServiceError 将业务错误映射为 HTTP 响应
func handleServiceError(c *app.RequestContext, err error) {
	switch e := err.(type) {
	case *service.ServiceError:
		response.Error(c, e.Code, e.Msg)
	case *service.AuthError:
		response.Error(c, e.Code, e.Msg)
	case *service.CommentError:
		response.Error(c, e.Code, e.Msg)
	case *service.PostError:
		response.Error(c, e.Code, e.Msg)
	case *service.AnnotationError:
		response.Error(c, e.Code, e.Msg)
	case *service.NotificationError:
		response.Error(c, e.Code, e.Msg)
	case *service.MessageError:
		response.Error(c, e.Code, e.Msg)
	case *service.AnnouncementError:
		response.Error(c, e.Code, e.Msg)
	case *service.PostSummaryError:
		response.Error(c, e.Code, e.Msg)
	case *service.ActivityError:
		response.Error(c, e.Code, e.Msg)
	case *service.DuplicateBookError:
		// 查重拦截需要把命中书名与所在格子回传，前端才能提示
		// 「这本书已在第 N 格打卡」（P1-8 / 验收标准 10）
		c.JSON(consts.StatusConflict, map[string]any{
			"error":      e.Error(),
			"duplicates": e.Detail,
			"titles":     e.Titles,
		})
	default:
		log.Printf("[Service] 未预期的错误: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
	}
}

// ========== User Handlers ==========

// SearchUsers 搜索用户（用于 @提及）
// GET /api/users/search?q=xxx
func SearchUsers(ctx context.Context, c *app.RequestContext) {
	q := c.Query("q")
	items, err := userService.SearchUsers(ctx, q)
	if err != nil {
		log.Printf("[SearchUsers] 搜索用户失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, map[string]interface{}{"items": items})
}

// SearchUsersAdmin 角色管理用搜索（仅管理员）
// GET /api/users/admin/role-management/search?q=xxx
func SearchUsersAdmin(ctx context.Context, c *app.RequestContext) {
	q := c.Query("q")
	items, err := userService.SearchUsersAdmin(ctx, q)
	if err != nil {
		log.Printf("[SearchUsersAdmin] 搜索用户失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, map[string]interface{}{"items": items})
}

// GetUser 查看用户主页（公开）
// GET /api/users/:username
func GetUser(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	currentUserID := middleware.GetCurrentUserID(c)

	dto, err := userService.GetUser(ctx, username, currentUserID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// GetUserPosts 查看用户发的帖子
// GET /api/users/:username/posts
func GetUserPosts(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	page, pageSize := pagination.Parse(c)
	currentUserID := middleware.GetCurrentUserID(c)

	result, err := userService.GetUserPosts(ctx, username, currentUserID, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// UpdateUser 更新当前用户资料（需登录）
// PUT /api/users/me
func UpdateUser(ctx context.Context, c *app.RequestContext) {
	var req types.UpdateUserReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	dto, err := userService.UpdateUser(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// UpdateUserRole 修改用户角色（仅管理员）
// PUT /api/users/:username/role
func UpdateUserRole(ctx context.Context, c *app.RequestContext) {
	var req types.UpdateUserRoleReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	username := c.Param("username")
	currentUserID := middleware.GetCurrentUserID(c)

	dto, err := userService.UpdateUserRole(ctx, username, req.Role, currentUserID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// ResetUserPassword 管理员重置用户密码（仅管理员）
// POST /api/users/:username/reset-password
func ResetUserPassword(ctx context.Context, c *app.RequestContext) {
	var req types.ResetPasswordReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	username := c.Param("username")
	if err := userService.ResetPassword(ctx, username, req.Password); err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]string{"message": "密码已重置"})
}

// BanUser 封禁/解禁用户（仅管理员/版主）
// POST /api/users/:username/ban
func BanUser(ctx context.Context, c *app.RequestContext) {
	var req types.BanUserReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "action 必须是 ban 或 unban")
		return
	}

	username := c.Param("username")
	handlerID := middleware.GetCurrentUserID(c)

	status, err := userService.BanUser(ctx, username, req.Action, handlerID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{
		"ok":     true,
		"status": status,
	})
}

// ========== Follow Handlers ==========

// FollowUser 关注某用户
// POST /api/users/:username/follow
func FollowUser(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	userID := middleware.GetCurrentUserID(c)

	// 从 query 参数获取可选的 groupId
	groupId := c.Query("groupId")

	created, err := userService.FollowUser(ctx, username, userID, groupId)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	body := map[string]interface{}{"ok": true, "isFollowing": true}
	if created {
		response.Created(c, body)
	} else {
		response.JSON(c, body)
	}
}

// UnfollowUser 取消关注
// DELETE /api/users/:username/follow
func UnfollowUser(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	userID := middleware.GetCurrentUserID(c)

	err := userService.UnfollowUser(ctx, username, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{"ok": true, "isFollowing": false})
}

// ========== Block Handlers ==========

// BlockUser 屏蔽用户
// POST /api/users/:username/block
func BlockUser(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	userID := middleware.GetCurrentUserID(c)

	created, err := userService.BlockUser(ctx, userID, username)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	body := map[string]interface{}{"ok": true, "isBlocked": true}
	if created {
		response.Created(c, body)
	} else {
		response.JSON(c, body)
	}
}

// UnblockUser 解除屏蔽
// DELETE /api/users/:username/block
func UnblockUser(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	userID := middleware.GetCurrentUserID(c)

	err := userService.UnblockUser(ctx, userID, username)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{"ok": true, "isBlocked": false})
}

// ListBlockedUsers 我的屏蔽列表
// GET /api/users/me/blocked
func ListBlockedUsers(ctx context.Context, c *app.RequestContext) {
	page, pageSize := pagination.Parse(c)
	userID := middleware.GetCurrentUserID(c)

	result, err := userService.ListBlockedUsers(ctx, userID, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListFollowing 获取某用户的关注列表
// GET /api/following/:username
func ListFollowing(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	page, pageSize := pagination.Parse(c)
	currentUserID := middleware.GetCurrentUserID(c)

	result, err := userService.ListFollowing(ctx, username, currentUserID, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListFollowers 获取某用户的粉丝列表
// GET /api/followers/:username
func ListFollowers(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	page, pageSize := pagination.Parse(c)
	currentUserID := middleware.GetCurrentUserID(c)

	result, err := userService.ListFollowers(ctx, username, currentUserID, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ========== Bookmark Handlers ==========

// BookmarkPost 收藏帖子
// POST /api/posts/:id/bookmark?folderId=xxx
func BookmarkPost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)
	folderId := c.Query("folderId")

	created, count, err := userService.BookmarkPost(ctx, id, userID, folderId)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	body := map[string]interface{}{
		"ok":            true,
		"bookmarked":    true,
		"bookmarkCount": count,
	}
	if created {
		response.Created(c, body)
	} else {
		response.JSON(c, body)
	}
}

// UnbookmarkPost 取消收藏
// DELETE /api/posts/:id/bookmark
func UnbookmarkPost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	count, err := userService.UnbookmarkPost(ctx, id, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{
		"ok":            true,
		"bookmarked":    false,
		"bookmarkCount": count,
	})
}

// ListBookmarks 获取当前用户的收藏列表
// GET /api/bookmarks?folderId=xxx
func ListBookmarks(ctx context.Context, c *app.RequestContext) {
	page, pageSize := pagination.Parse(c)
	userID := middleware.GetCurrentUserID(c)
	folderId := c.Query("folderId")

	result, err := userService.ListBookmarks(ctx, userID, folderId, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ========== Notification Handlers ==========

var notificationService = &service.NotificationService{}
var searchService = &service.SearchService{}

func ListNotifications(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)
	notifType := c.Query("type")

	result, err := notificationService.ListNotifications(ctx, userID, page, pageSize, notifType)
	if err != nil {
		log.Printf("[Notification] 获取通知列表失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}

func UnreadCount(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	count, err := notificationService.UnreadCount(ctx, userID)
	if err != nil {
		log.Printf("[Notification] 获取未读数失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, map[string]int64{"count": count})
}

func MarkNotificationRead(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := notificationService.MarkNotificationRead(ctx, id, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]bool{"ok": true, "read": true})
}

func MarkAllRead(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	if err := notificationService.MarkAllRead(ctx, userID); err != nil {
		log.Printf("[Notification] 全部已读失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.OK(c)
}

// DeleteNotification 删除单条通知
// DELETE /api/notifications/:id
func DeleteNotification(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := notificationService.DeleteNotification(ctx, id, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// GetNotificationPreferences 获取当前用户通知偏好
func GetNotificationPreferences(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	result, err := notificationService.GetPreferences(ctx, userID)
	if err != nil {
		log.Printf("[Notification] 获取偏好失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}

// UpdateNotificationPreferences 更新当前用户通知偏好
func UpdateNotificationPreferences(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	var req types.UpdateNotificationPreferenceReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := notificationService.UpdatePreferences(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ========== Search Handler ==========

func Search(ctx context.Context, c *app.RequestContext) {
	q := c.Query("q")
	scope := c.Query("scope")
	if scope == "" {
		scope = "all"
	}
	if scope != "all" && scope != "posts" && scope != "comments" && scope != "users" {
		scope = "all"
	}
	channel := c.Query("channel")
	author := c.Query("author")
	from := c.Query("from")
	to := c.Query("to")
	sort := c.Query("sort")
	if sort == "" {
		sort = "latest"
	}
	userID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := searchService.Search(ctx, q, scope, channel, author, from, to, sort, userID, page, pageSize)
	if err != nil {
		log.Printf("[Search] 搜索失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "搜索失败")
		return
	}
	response.JSON(c, result)
}

// ========== Bookmark Folder Handlers ==========

// ListBookmarkFolders 获取收藏夹列表
// GET /api/bookmarks/folders
func ListBookmarkFolders(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	folders, err := userService.ListBookmarkFolders(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{"items": folders})
}

// CreateBookmarkFolder 创建收藏夹
// POST /api/bookmarks/folders
func CreateBookmarkFolder(ctx context.Context, c *app.RequestContext) {
	var req types.CreateBookmarkFolderReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	folder, err := userService.CreateBookmarkFolder(ctx, userID, req.Name)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, folder)
}

// UpdateBookmarkFolder 更新收藏夹
// PUT /api/bookmarks/folders/:id
func UpdateBookmarkFolder(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	var req types.UpdateBookmarkFolderReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	folder, err := userService.UpdateBookmarkFolder(ctx, id, userID, req.Name)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, folder)
}

// DeleteBookmarkFolder 删除收藏夹
// DELETE /api/bookmarks/folders/:id
func DeleteBookmarkFolder(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := userService.DeleteBookmarkFolder(ctx, id, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// ========== Follow Group Handlers ==========

// ListFollowGroups 获取关注分组列表
// GET /api/follow-groups
func ListFollowGroups(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	groups, err := userService.ListFollowGroups(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{"items": groups})
}

// CreateFollowGroup 创建关注分组
// POST /api/follow-groups
func CreateFollowGroup(ctx context.Context, c *app.RequestContext) {
	var req types.CreateFollowGroupReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	group, err := userService.CreateFollowGroup(ctx, userID, req.Name)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, group)
}

// UpdateFollowGroup 更新关注分组
// PUT /api/follow-groups/:id
func UpdateFollowGroup(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	var req types.UpdateFollowGroupReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	group, err := userService.UpdateFollowGroup(ctx, id, userID, req.Name)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, group)
}

// DeleteFollowGroup 删除关注分组
// DELETE /api/follow-groups/:id
func DeleteFollowGroup(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := userService.DeleteFollowGroup(ctx, id, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}
