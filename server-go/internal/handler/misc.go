package handler

import (
	"context"

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
	case *service.NotificationError:
		response.Error(c, e.Code, e.Msg)
	case *service.MessageError:
		response.Error(c, e.Code, e.Msg)
	default:
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

// ========== Follow Handlers ==========

// FollowUser 关注某用户
// POST /api/users/:username/follow
func FollowUser(ctx context.Context, c *app.RequestContext) {
	username := c.Param("username")
	userID := middleware.GetCurrentUserID(c)

	created, err := userService.FollowUser(ctx, username, userID)
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
// POST /api/posts/:id/bookmark
func BookmarkPost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	created, count, err := userService.BookmarkPost(ctx, id, userID)
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
// GET /api/bookmarks
func ListBookmarks(ctx context.Context, c *app.RequestContext) {
	page, pageSize := pagination.Parse(c)
	userID := middleware.GetCurrentUserID(c)

	result, err := userService.ListBookmarks(ctx, userID, page, pageSize)
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

	result, err := notificationService.ListNotifications(ctx, userID, page, pageSize)
	if err != nil {
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}

func UnreadCount(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	count, err := notificationService.UnreadCount(ctx, userID)
	if err != nil {
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
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.OK(c)
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
		response.Error(c, consts.StatusInternalServerError, "搜索失败")
		return
	}
	response.JSON(c, result)
}
