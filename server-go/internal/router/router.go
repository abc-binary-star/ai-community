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

	// --- 划线高亮路由 ---
	h.GET("/api/posts/:id/highlights", middleware.OptionalAuth(), handler.ListHighlights)
	h.POST("/api/posts/:id/highlights", middleware.Auth(), handler.CreateHighlight)
	h.DELETE("/api/posts/:id/highlights/:highlightId", middleware.Auth(), handler.DeleteHighlight)
	h.PUT("/api/posts/:id/highlights/:highlightId", middleware.Auth(), handler.UpdateHighlight)

	// --- 段落想法（批注）路由 ---
	h.GET("/api/posts/:id/annotations", middleware.OptionalAuth(), handler.ListAnnotations)
	h.POST("/api/posts/:id/annotations", middleware.Auth(), handler.CreateAnnotation)
	h.PATCH("/api/posts/:id/annotations/:annotationId", middleware.Auth(), handler.UpdateAnnotation)
	h.DELETE("/api/posts/:id/annotations/:annotationId", middleware.Auth(), handler.DeleteAnnotation)
	h.GET("/api/posts/:id/annotations/:annotationId/replies", middleware.OptionalAuth(), handler.ListAnnotationReplies)
	h.POST("/api/posts/:id/annotations/:annotationId/replies", middleware.Auth(), handler.CreateAnnotationReply)
	h.POST("/api/posts/:id/annotations/:annotationId/like", middleware.Auth(), handler.LikeAnnotation)
	h.DELETE("/api/posts/:id/annotations/:annotationId/like", middleware.Auth(), handler.UnlikeAnnotation)
	h.PATCH("/api/annotation-replies/:id", middleware.Auth(), handler.UpdateAnnotationReply)
	h.DELETE("/api/annotation-replies/:id", middleware.Auth(), handler.DeleteAnnotationReply)

	// --- 想法流（跨帖分发）路由 ---
	h.GET("/api/ideas", middleware.OptionalAuth(), handler.ListIdeaFeed)
	h.GET("/api/ideas/:id", middleware.OptionalAuth(), handler.GetIdea)
	h.GET("/api/ideas/:id/chain", middleware.OptionalAuth(), handler.GetIdeaChain)

	// --- 官方公告路由 ---
	h.GET("/api/announcements", middleware.OptionalAuth(), handler.ListAnnouncements)
	h.POST("/api/announcements", middleware.Auth(), middleware.RequireRole("admin"), handler.CreateAnnouncement)
	h.GET("/api/announcements/banner", middleware.OptionalAuth(), handler.GetAnnouncementBanner)
	h.GET("/api/announcements/unread-count", middleware.Auth(), handler.GetAnnouncementUnreadCount)
	h.POST("/api/announcements/read-all", middleware.Auth(), handler.MarkAllAnnouncementsRead)
	h.POST("/api/announcements/:id/read", middleware.Auth(), handler.MarkAnnouncementRead)
	h.GET("/api/announcements/:id", middleware.OptionalAuth(), handler.GetAnnouncement)
	h.PUT("/api/announcements/:id", middleware.Auth(), middleware.RequireRole("admin"), handler.UpdateAnnouncement)
	h.PUT("/api/announcements/:id/status", middleware.Auth(), middleware.RequireRole("admin"), handler.UpdateAnnouncementStatus)
	h.DELETE("/api/announcements/:id", middleware.Auth(), middleware.RequireRole("admin"), handler.DeleteAnnouncement)

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
	// 角色管理专用搜索，须在 :username 参数路由之前注册（静态段优先匹配）
	users.GET("/admin/role-management/search", middleware.Auth(), middleware.RequireRole("admin"), handler.SearchUsersAdmin)
	users.GET("/:username", middleware.OptionalAuth(), handler.GetUser)
	users.GET("/:username/posts", middleware.OptionalAuth(), handler.GetUserPosts)
	users.PUT("/me", middleware.Auth(), handler.UpdateUser)
	users.GET("/me/blocked", middleware.Auth(), handler.ListBlockedUsers)
	users.POST("/:username/follow", middleware.Auth(), handler.FollowUser)
	users.DELETE("/:username/follow", middleware.Auth(), handler.UnfollowUser)
	users.PUT("/:username/role", middleware.Auth(), middleware.RequireRole("admin"), handler.UpdateUserRole)
	// 管理员重置用户密码（仅 admin；新密码由管理员线下告知用户）
	users.POST("/:username/reset-password", middleware.Auth(), middleware.RequireRole("admin"), handler.ResetUserPassword)
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

	// --- 活动「无限循环读书地狱」路由 ---
	// 挂在独立路由分组下，与社区业务解耦（PRD 第 12 节隔离要求）。
	// 全部接口强制登录：活动页不开放游客浏览（P1-9 / 验收标准 9）。
	activity := h.Group("/api/activity/hell-board", middleware.Auth())
	activity.GET("/board", handler.GetActivityBoard)
	activity.GET("/checkins", handler.ListActivityCheckIns)
	activity.POST("/checkins", handler.CreateActivityCheckIn)
	activity.PUT("/checkins/:id", handler.UpdateActivityCheckIn)
	activity.DELETE("/checkins/:id", handler.DeleteActivityCheckIn)
	// 我的打卡（三栏：未审核 / 已通过 / 已驳回）
	activity.GET("/my-books", handler.ListActivityMyBooks)
	// 审核池：全员可见（只读），队长通过 /vote-pool/:bookId/vote 投票
	activity.GET("/vote-pool", handler.ListActivityVotePool)
	activity.POST("/vote-pool/:bookId/vote", handler.CastActivityVote)
	// 成员阅读档案与打卡点赞（「全部队伍」标签页）
	activity.GET("/members/:memberId/checkins", handler.GetActivityMemberCheckIns)
	activity.POST("/checkins/:id/like", handler.LikeActivityCheckIn)
	activity.DELETE("/checkins/:id/like", handler.UnlikeActivityCheckIn)
	activity.POST("/roll", handler.RollActivityDice)
	activity.POST("/advance", handler.AdvanceActivityTeam)
	activity.POST("/advance/fallback", handler.FallbackAdvanceActivityTeam)
	activity.GET("/judgement", handler.GetActivityJudgement)
	activity.POST("/judgement/roll", handler.RollActivityJudgement)
	activity.GET("/tiles/:index", handler.GetActivityTileDetail)
	activity.GET("/ranking", handler.GetActivityRanking)
	activity.GET("/ranking/lit", handler.GetActivityLitRanking)
	activity.GET("/timeline", handler.ListActivityTimeline)
	// 活动大事件流：全员打卡 + 全场事件，未入组的观战用户也可查看
	activity.GET("/feed", handler.ListActivityFeed)
	activity.GET("/library", handler.ListActivityBookLibrary)
	activity.POST("/enroll", handler.EnrollActivity)
	// 反馈（bug / 需求）：登录用户即可提交，管理员在监督台（审批台）查看
	activity.POST("/feedback", handler.CreateActivityFeedback)

	// 队长管理（报名名单拉人 / 换队名 / 一次性选形象）
	captain := h.Group("/api/activity/hell-board/team", middleware.Auth())
	captain.PUT("", handler.UpdateTeamByCaptain)
	captain.GET("/enrollments", handler.ListActivityEnrollments)
	captain.POST("/members", handler.AddTeamMemberByCaptain)
	// 队长初始化队伍进度：补录活动已开始后的真实位置/已点亮格（幂等）
	captain.POST("/initialize", handler.InitializeActivityTeam)
	// 自助选组入队（可选成为队长）
	captain.POST("/join", handler.JoinActivityTeam)
	// 入队后补选队长（队长位空缺时）：入队时没勾队长的成员也能成为队长
	captain.POST("/claim-captain", handler.ClaimActivityCaptain)
	// 退出队伍（选错队伍时退出重选）：仅在还没有任何打卡/掷骰/投票时允许
	captain.POST("/leave", handler.LeaveActivityTeam)
	// 修改活动内昵称（榜单与成员名单的展示名）
	captain.PUT("/nickname", handler.UpdateActivityNickname)

	// 人工终审台与运营后台（PRD 9.3 / 第 13 节）
	activityAdmin := h.Group("/api/activity/hell-board/admin",
		middleware.Auth(), middleware.RequireRole("admin", "moderator"))
	activityAdmin.GET("/reviews", handler.ListActivityReviewQueue)
	activityAdmin.POST("/reviews/batch-approve", handler.BatchApproveActivityBooks)
	activityAdmin.POST("/reviews/:bookId", handler.ReviewActivityBook)
	// 管理员代成员补打卡（审批台「补卡」入口）
	activityAdmin.POST("/checkins", handler.AdminCreateActivityCheckIn)
	// 反馈（bug / 需求）审批台：查看与标记已处理
	activityAdmin.GET("/feedback", handler.ListActivityFeedback)
	activityAdmin.PUT("/feedback/:id", handler.ResolveActivityFeedback)
	activityAdmin.GET("/export", handler.ExportActivityResults)
	activityAdmin.POST("/teams", handler.CreateActivityTeam)
	activityAdmin.PUT("/teams/:id", handler.UpdateActivityTeam)
	activityAdmin.DELETE("/teams/:id", middleware.RequireRole("admin"), handler.DeleteActivityTeam)
	activityAdmin.POST("/teams/:id/members", handler.AddActivityMember)
	// 手工修正会直接改写队伍位置与点亮状态且不可逆，限定仅 admin（与社区破坏性操作分级一致）
	activityAdmin.POST("/teams/:id/manual-fix", middleware.RequireRole("admin"), handler.ManualFixActivityTeam)
	activityAdmin.DELETE("/members/:memberId", handler.RemoveActivityMember)
	activityAdmin.PUT("/members/:memberId/captain", handler.SetActivityCaptain)
	activityAdmin.PUT("/tiles/:index", handler.UpdateActivityTile)

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
