package router

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/handler"
	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/hertz-contrib/cors"
)

// Register 注册所有路由
func Register(h *server.Hertz, cfg *conf.Config) {
	// CORS
	h.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// 健康检查
	h.GET("/api/health", handler.Health)

	// --- 频道路由 ---
	h.GET("/api/channels", handler.ListChannels)
	h.POST("/api/channels", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.CreateChannel)
	h.PUT("/api/channels/:id", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.UpdateChannel)
	h.DELETE("/api/channels/:id", middleware.Auth(), middleware.RequireRole("admin"), handler.DeleteChannel)

	// --- 认证路由 ---
	auth := h.Group("/api/auth")
	auth.POST("/register", handler.Register)
	auth.POST("/login", handler.Login)
	auth.POST("/refresh", handler.RefreshToken)
	auth.GET("/me", middleware.Auth(), handler.Me)

	// --- 帖子路由 ---
	// 注意：前端请求 /api/posts（不带尾部斜杠），Hertz 不会自动重定向，
	// 因此直接在 h 上注册而非用 Group 的 "/" 路径
	h.GET("/api/posts", middleware.OptionalAuth(), handler.ListPosts)
	h.POST("/api/posts", middleware.Auth(), handler.CreatePost)
	h.GET("/api/posts/tags/popular", handler.PopularTags)
	h.POST("/api/posts/suggest-tags", middleware.Auth(), handler.SuggestTags)
	h.GET("/api/posts/:id", middleware.OptionalAuth(), handler.GetPost)
	h.PUT("/api/posts/:id", middleware.Auth(), handler.UpdatePost)
	h.DELETE("/api/posts/:id", middleware.Auth(), handler.DeletePost)
	h.PUT("/api/posts/:id/status", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.SetPostStatus)
	h.GET("/api/posts/:id/summary", handler.GetPostSummary)
	h.POST("/api/posts/:id/like", middleware.Auth(), handler.LikePost)
	h.DELETE("/api/posts/:id/like", middleware.Auth(), handler.UnlikePost)

	// --- 评论路由 ---
	h.GET("/api/posts/:id/comments", middleware.OptionalAuth(), handler.ListComments)
	h.POST("/api/posts/:id/comments", middleware.Auth(), handler.CreateComment)
	h.GET("/api/comments/:id/replies", middleware.OptionalAuth(), handler.ListReplies)
	h.PUT("/api/comments/:id", middleware.Auth(), handler.UpdateComment)
	h.DELETE("/api/comments/:id", middleware.Auth(), handler.DeleteComment)
	h.POST("/api/comments/:id/like", middleware.Auth(), handler.LikeComment)
	h.DELETE("/api/comments/:id/like", middleware.Auth(), handler.UnlikeComment)

	// --- 收藏路由 ---
	h.POST("/api/posts/:id/bookmark", middleware.Auth(), handler.BookmarkPost)
	h.DELETE("/api/posts/:id/bookmark", middleware.Auth(), handler.UnbookmarkPost)
	h.GET("/api/bookmarks", middleware.Auth(), handler.ListBookmarks)

	// --- 用户路由 ---
	users := h.Group("/api/users")
	users.GET("/search", middleware.Auth(), handler.SearchUsers)
	users.GET("/:username", middleware.OptionalAuth(), handler.GetUser)
	users.GET("/:username/posts", middleware.OptionalAuth(), handler.GetUserPosts)
	users.PUT("/me", middleware.Auth(), handler.UpdateUser)
	users.GET("/me/blocked", middleware.Auth(), handler.ListBlockedUsers)
	users.POST("/:username/follow", middleware.Auth(), handler.FollowUser)
	users.DELETE("/:username/follow", middleware.Auth(), handler.UnfollowUser)
	users.PUT("/:username/role", middleware.Auth(), middleware.RequireRole("admin"), handler.UpdateUserRole)
	users.POST("/:username/block", middleware.Auth(), handler.BlockUser)
	users.DELETE("/:username/block", middleware.Auth(), handler.UnblockUser)

	// --- 关注列表 ---
	h.GET("/api/following/:username", middleware.OptionalAuth(), handler.ListFollowing)
	h.GET("/api/followers/:username", middleware.OptionalAuth(), handler.ListFollowers)

	// --- 通知路由 ---
	// 注意：前端请求 /api/notifications（不带尾部斜杠）
	h.GET("/api/notifications", middleware.Auth(), handler.ListNotifications)
	h.GET("/api/notifications/unread-count", middleware.Auth(), handler.UnreadCount)
	h.POST("/api/notifications/:id/read", middleware.Auth(), handler.MarkNotificationRead)
	h.POST("/api/notifications/read-all", middleware.Auth(), handler.MarkAllRead)
	h.GET("/api/notifications/preferences", middleware.Auth(), handler.GetNotificationPreferences)
	h.PUT("/api/notifications/preferences", middleware.Auth(), handler.UpdateNotificationPreferences)

	// --- 搜索路由 ---
	h.GET("/api/search", middleware.OptionalAuth(), handler.Search)

	// --- 举报路由 ---
	h.POST("/api/reports", middleware.Auth(), handler.CreateReport)
	h.GET("/api/reports", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.ListReports)
	h.PUT("/api/reports/:id", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.HandleReport)

	// --- 发现页路由 ---
	h.GET("/api/discover", middleware.OptionalAuth(), handler.Discover)

	// --- 私信路由 ---
	h.GET("/api/messages/unread-count", middleware.Auth(), handler.UnreadMessageCount)
	h.GET("/api/messages/conversations", middleware.Auth(), handler.ListConversations)
	h.POST("/api/messages/conversations", middleware.Auth(), handler.CreateConversation)
	h.GET("/api/messages/conversations/:id/messages", middleware.Auth(), handler.ListMessages)
	h.POST("/api/messages/conversations/:id/messages", middleware.Auth(), handler.SendMessage)
	h.POST("/api/messages/conversations/:id/read", middleware.Auth(), handler.MarkConversationRead)

	// 统一 404
	h.NoRoute(func(ctx context.Context, c *app.RequestContext) {
		c.JSON(consts.StatusNotFound, map[string]string{"error": "接口不存在"})
	})
}
