package router

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/handler"
	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ailimit"
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
	h.GET("/api/channels/tree", handler.GetChannelTree)
	h.POST("/api/channels", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.CreateChannel)
	h.PUT("/api/channels/:id", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.UpdateChannel)
	h.DELETE("/api/channels/:id", middleware.Auth(), middleware.RequireRole("admin"), handler.DeleteChannel)

	// --- 频道分组路由 ---
	h.GET("/api/channel-categories", handler.ListCategories)
	h.POST("/api/channel-categories", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.CreateCategory)
	h.PUT("/api/channel-categories/:id", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.UpdateCategory)
	h.DELETE("/api/channel-categories/:id", middleware.Auth(), middleware.RequireRole("admin"), handler.DeleteCategory)

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
	h.POST("/api/posts/suggest-tags", middleware.Auth(), middleware.AILimit(ailimit.FeatureSuggestTags), handler.SuggestTags)
	h.GET("/api/posts/:id", middleware.OptionalAuth(), handler.GetPost)
	h.PUT("/api/posts/:id", middleware.Auth(), handler.UpdatePost)
	h.DELETE("/api/posts/:id", middleware.Auth(), handler.DeletePost)
	h.PUT("/api/posts/:id/status", middleware.Auth(), middleware.RequireRole("admin", "moderator"), handler.SetPostStatus)
	h.GET("/api/posts/:id/summary", middleware.OptionalAuth(), handler.GetThreadSummary)
	h.POST("/api/posts/:id/summary", middleware.Auth(), middleware.AILimit(ailimit.FeatureThreadSummary), handler.GenerateThreadSummary)
	h.POST("/api/posts/:id/like", middleware.Auth(), handler.LikePost)
	h.DELETE("/api/posts/:id/like", middleware.Auth(), handler.UnlikePost)

	// --- AI 辅助创作路由 ---
	ai := h.Group("/api/ai", middleware.Auth())
	ai.POST("/enrich", middleware.AILimit(ailimit.FeatureEnrich), handler.Enrich)
	ai.POST("/suggest-title", middleware.AILimit(ailimit.FeatureSuggestTitle), handler.SuggestTitle)
	ai.POST("/rewrite", middleware.AILimit(ailimit.FeatureRewrite), handler.Rewrite)
	// 流式润色按分片串行调用模型，一次请求可产生 N 次调用，是最耗 token 的接口，
	// 必须在 SSE 开始前就拒绝超限请求，否则用户会遇到「润色到一半突然报错」。
	ai.POST("/rewrite-stream", middleware.AILimit(ailimit.FeatureRewrite), handler.RewriteStream)
	ai.POST("/summarize", middleware.AILimit(ailimit.FeatureSummarize), handler.Summarize)
	ai.POST("/voice-polish", middleware.AILimit(ailimit.FeatureVoicePolish), handler.VoicePolish)
	ai.POST("/transcribe", middleware.AILimit(ailimit.FeatureTranscribe), handler.Transcribe)
	ai.GET("/usage", handler.GetAIUsage)
	ai.GET("/plan", handler.GetAIPlan)

	// --- 商业化占位 ---
	h.POST("/api/billing/upgrade", middleware.Auth(), handler.UpgradePlan)
	h.POST("/api/billing/subscription", middleware.Auth(), middleware.RequireRole("admin"), handler.GrantSubscription)

	// --- 评论路由 ---
	h.GET("/api/posts/:id/comments", middleware.OptionalAuth(), handler.ListComments)
	h.POST("/api/posts/:id/comments", middleware.Auth(), handler.CreateComment)
	h.GET("/api/comments/:id/replies", middleware.OptionalAuth(), handler.ListReplies)
	h.POST("/api/comments/:id/like", middleware.Auth(), handler.LikeComment)
	h.DELETE("/api/comments/:id/like", middleware.Auth(), handler.UnlikeComment)

	// --- 收藏路由 ---
	h.POST("/api/posts/:id/bookmark", middleware.Auth(), handler.BookmarkPost)
	h.DELETE("/api/posts/:id/bookmark", middleware.Auth(), handler.UnbookmarkPost)
	h.GET("/api/bookmarks", middleware.Auth(), handler.ListBookmarks)
	h.GET("/api/bookmarks/folders", middleware.Auth(), handler.ListBookmarkFolders)
	h.POST("/api/bookmarks/folders", middleware.Auth(), handler.CreateBookmarkFolder)
	h.PUT("/api/bookmarks/folders/:id", middleware.Auth(), handler.UpdateBookmarkFolder)
	h.DELETE("/api/bookmarks/folders/:id", middleware.Auth(), handler.DeleteBookmarkFolder)

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

	// --- 关注分组 ---
	h.GET("/api/follow-groups", middleware.Auth(), handler.ListFollowGroups)
	h.POST("/api/follow-groups", middleware.Auth(), handler.CreateFollowGroup)
	h.PUT("/api/follow-groups/:id", middleware.Auth(), handler.UpdateFollowGroup)
	h.DELETE("/api/follow-groups/:id", middleware.Auth(), handler.DeleteFollowGroup)

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

	// --- 文件上传路由 ---
	// 静态文件服务（本地存储模式时使用）
	h.Static("/uploads", "./uploads")
	h.POST("/api/upload/avatar", middleware.Auth(), middleware.UploadLimit(), handler.UploadAvatar)
	h.POST("/api/upload/image", middleware.Auth(), middleware.UploadLimit(), handler.UploadImage)
	// 外站图片转存：绕过 B站/贴吧等图床的 Referer 防盗链
	h.POST("/api/upload/remote-images", middleware.Auth(), middleware.UploadLimit(), handler.FetchRemoteImages)

	// 统一 404
	h.NoRoute(func(ctx context.Context, c *app.RequestContext) {
		c.JSON(consts.StatusNotFound, map[string]string{"error": "接口不存在"})
	})
}
