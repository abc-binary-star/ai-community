package handler

import (
	"context"
	"strconv"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
)

var activityService = &service.ActivityService{}

// GetActivityBoard 棋盘全局快照
// GET /api/activity/hell-board/board
func GetActivityBoard(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	board, err := activityService.GetBoard(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, board)
}

// ListActivityCheckIns 本队打卡列表
// GET /api/activity/hell-board/checkins
func ListActivityCheckIns(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	items, err := activityService.ListMyTeamCheckIns(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": items})
}

// CreateActivityCheckIn 提交打卡
// POST /api/activity/hell-board/checkins
func CreateActivityCheckIn(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityCheckInReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := activityService.SubmitCheckIn(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// DeleteActivityCheckIn 撤回未审打卡
// DELETE /api/activity/hell-board/checkins/:id
func DeleteActivityCheckIn(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.DeleteCheckIn(ctx, userID, c.Param("id")); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// RollActivityDice 队长掷骰前进
// POST /api/activity/hell-board/roll
func RollActivityDice(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	result, err := activityService.RollDice(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// GetActivityJudgement 读取当前判定会话
// GET /api/activity/hell-board/judgement
func GetActivityJudgement(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	session, err := activityService.GetJudgement(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	// 当前格无特殊判定时返回 null，前端据此隐藏判定面板
	response.JSON(c, session)
}

// RollActivityJudgement 成员参与判定掷骰
// POST /api/activity/hell-board/judgement/roll
func RollActivityJudgement(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	session, err := activityService.RollJudgement(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, session)
}

// GetActivityTileDetail 格子打卡记录
// GET /api/activity/hell-board/tiles/:index
func GetActivityTileDetail(ctx context.Context, c *app.RequestContext) {
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 1 || index > 20 {
		response.BadRequest(c, "格子编号不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	detail, err := activityService.GetTileDetail(ctx, userID, index)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, detail)
}

// GetActivityRanking 榜单
// GET /api/activity/hell-board/ranking?metric=books|words&subject=team|member
func GetActivityRanking(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	limit := 10
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	rows, err := activityService.GetRanking(ctx, userID, c.Query("metric"), c.Query("subject"), limit)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": rows})
}

// GetActivityLitRanking 点亮进度榜
// GET /api/activity/hell-board/ranking/lit
func GetActivityLitRanking(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	rows, err := activityService.GetLitRanking(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": rows})
}

// ListActivityTimeline 队伍时间线
// GET /api/activity/hell-board/timeline
func ListActivityTimeline(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	events, err := activityService.ListTimeline(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": events})
}

// ListActivityBookLibrary 第 20 格候选书库
// GET /api/activity/hell-board/library?keyword=
func ListActivityBookLibrary(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	limit := 50
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	books, err := activityService.ListBookLibrary(ctx, userID, c.Query("keyword"), limit)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": books})
}

// --- 管理员：人工终审台与运营后台 ---

// ListActivityReviewQueue 审核队列
// GET /api/activity/hell-board/admin/reviews?teamId=&tileIndex=&status=
func ListActivityReviewQueue(ctx context.Context, c *app.RequestContext) {
	page, pageSize := pagination.Parse(c)
	tileIndex := 0
	if v := c.Query("tileIndex"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			tileIndex = n
		}
	}
	result, err := activityService.ListReviewQueue(ctx, c.Query("teamId"), tileIndex, c.Query("status"), page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ReviewActivityBook 人工终审单条书目
// POST /api/activity/hell-board/admin/reviews/:bookId
func ReviewActivityBook(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityReviewReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	reviewerID := middleware.GetCurrentUserID(c)
	dto, err := activityService.Review(ctx, reviewerID, c.Param("bookId"), req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// ListActivityMyBooks 我的打卡，按状态分组
// GET /api/activity/hell-board/my-books?status=pending|approved|rejected
func ListActivityMyBooks(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	status := c.Query("status")
	items, err := activityService.ListMyBooks(ctx, userID, status)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": items})
}

// ListActivityVotePool 投票池：全员可见
// GET /api/activity/hell-board/vote-pool
func ListActivityVotePool(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	items, err := activityService.ListVotePool(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": items})
}

// GetActivityMemberCheckIns 成员阅读档案（已通过打卡 + 汇总 + 点赞数）
// GET /api/activity/hell-board/members/:memberId/checkins
func GetActivityMemberCheckIns(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	profile, err := activityService.GetMemberCheckIns(ctx, userID, c.Param("memberId"))
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, profile)
}

// LikeActivityCheckIn 点赞某次打卡
// POST /api/activity/hell-board/checkins/:id/like
func LikeActivityCheckIn(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.LikeCheckIn(ctx, userID, c.Param("id")); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// UnlikeActivityCheckIn 取消点赞
// DELETE /api/activity/hell-board/checkins/:id/like
func UnlikeActivityCheckIn(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.UnlikeCheckIn(ctx, userID, c.Param("id")); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// CastActivityVote 队长投票
// POST /api/activity/hell-board/vote-pool/:bookId/vote
func CastActivityVote(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityVoteReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	item, err := activityService.CastVote(ctx, userID, c.Param("bookId"), req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, item)
}

// BatchApproveActivityBooks 批量确认 AI 通过项
// POST /api/activity/hell-board/admin/reviews/batch-approve
func BatchApproveActivityBooks(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityBatchReviewReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	reviewerID := middleware.GetCurrentUserID(c)
	count, err := activityService.BatchApprove(ctx, reviewerID, req.BookIDs)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]int{"approved": count})
}

// CreateActivityTeam 新建小组
// POST /api/activity/hell-board/admin/teams
func CreateActivityTeam(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityTeamUpsertReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	dto, err := activityService.CreateTeam(ctx, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// UpdateActivityTeam 修改小组
// PUT /api/activity/hell-board/admin/teams/:id
func UpdateActivityTeam(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityTeamUpsertReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	if err := activityService.UpdateTeam(ctx, c.Param("id"), req); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// DeleteActivityTeam 删除小组
// DELETE /api/activity/hell-board/admin/teams/:id
func DeleteActivityTeam(ctx context.Context, c *app.RequestContext) {
	if err := activityService.DeleteTeam(ctx, c.Param("id")); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// AddActivityMember 添加成员
// POST /api/activity/hell-board/admin/teams/:id/members
func AddActivityMember(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityMemberUpsertReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	dto, err := activityService.AddMember(ctx, c.Param("id"), req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// RemoveActivityMember 移出成员
// DELETE /api/activity/hell-board/admin/members/:memberId
func RemoveActivityMember(ctx context.Context, c *app.RequestContext) {
	if err := activityService.RemoveMember(ctx, c.Param("memberId")); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// SetActivityCaptain 指定队长
// PUT /api/activity/hell-board/admin/members/:memberId/captain
func SetActivityCaptain(ctx context.Context, c *app.RequestContext) {
	if err := activityService.SetCaptain(ctx, c.Param("memberId")); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// UpdateActivityTile 调整格子任务文案
// PUT /api/activity/hell-board/admin/tiles/:index
func UpdateActivityTile(ctx context.Context, c *app.RequestContext) {
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 1 || index > 20 {
		response.BadRequest(c, "格子编号不合法")
		return
	}
	var req types.ActivityTileUpdateReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	if err := activityService.UpdateTile(ctx, index, req); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// ManualFixActivityTeam 手工修正队伍进度
// POST /api/activity/hell-board/admin/teams/:id/manual-fix
func ManualFixActivityTeam(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityManualFixReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	adminID := middleware.GetCurrentUserID(c)
	if err := activityService.ManualFix(ctx, adminID, c.Param("id"), req); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// ExportActivityResults 导出结果与抽奖名单
// GET /api/activity/hell-board/admin/export
func ExportActivityResults(ctx context.Context, c *app.RequestContext) {
	result, err := activityService.ExportResults(ctx)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// EnrollActivity 报名活动（入队的前提），可携带活动内昵称
// POST /api/activity/hell-board/enroll
func EnrollActivity(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	var req types.ActivityEnrollReq
	// 兼容空 body 报名：绑定失败视为空昵称
	_ = c.Bind(&req)
	dto, err := activityService.Enroll(ctx, userID, req.Nickname)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// JoinActivityTeam 自助选组入队，可同步选择成为队长
// POST /api/activity/hell-board/team/join
func JoinActivityTeam(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityJoinTeamReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := activityService.JoinTeam(ctx, userID, req.TeamID, req.IsCaptain)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// ListActivityEnrollments 报名名单（仅队长可见）
// GET /api/activity/hell-board/team/enrollments
func ListActivityEnrollments(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	items, err := activityService.Enrollments(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": items})
}

// UpdateTeamByCaptain 队长更新队名 / 一次性选择队伍形象
// PUT /api/activity/hell-board/team
func UpdateTeamByCaptain(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityTeamUpsertReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.CaptainUpdateTeam(ctx, userID, req); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// AddTeamMemberByCaptain 队长从报名名单拉人入队
// POST /api/activity/hell-board/team/members
func AddTeamMemberByCaptain(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityTeamAddMemberReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := activityService.CaptainAddMember(ctx, userID, req.UserID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}
