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

// GetActivityBoard 棋盘全局快照（百格地图 + 队伍状态 + 当前用户身份）
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

// RollActivityDice 队长录入群里掷出的骰子点数（程序按 100 格地图结算）
// POST /api/activity/hell-board/roll
func RollActivityDice(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityRollReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	result, err := activityService.RecordRoll(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// UseActivityUniversalDice 队长使用 1 枚万能骰子（无视当前格子效果）
// POST /api/activity/hell-board/universal-dice
func UseActivityUniversalDice(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityRollReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	result, err := activityService.UseUniversalDice(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// CompleteActivityCycle 队长声明本轮彩虹集齐（群里集齐后在 App 内登记，+1 掷骰机会）
// POST /api/activity/hell-board/cycle
func CompleteActivityCycle(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	team, err := activityService.CompleteCycle(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, team)
}

// GetActivityRanking 团队进度榜（位置降序，并列按彩虹/积分）
// GET /api/activity/hell-board/ranking
func GetActivityRanking(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	rows, err := activityService.GetRanking(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": rows})
}

// ListActivityTimeline 本队时间线
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

// ListActivityBigEvents 全局大事件（最近各队掷骰动态）
// GET /api/activity/hell-board/big-events
func ListActivityBigEvents(ctx context.Context, c *app.RequestContext) {
	events, err := activityService.ListBigEvents(ctx)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": events})
}

// EnrollActivity 报名活动（入队的前提），可携带活动内昵称
// POST /api/activity/hell-board/enroll
func EnrollActivity(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	var req types.ActivityEnrollReq
	// 兼容空 body 报名：绑定失败视为空昵称
	_ = c.Bind(&req)
	dto, err := activityService.Enroll(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// JoinActivityTeam 自助选组入队：满 7 人、队长位、彩虹色一人一色
// POST /api/activity/hell-board/team/join
func JoinActivityTeam(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityJoinTeamReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := activityService.JoinTeam(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// ClaimActivityColor 认领/更换彩虹色（一人一色）
// POST /api/activity/hell-board/team/color
func ClaimActivityColor(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityClaimColorReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := activityService.ClaimColor(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// UpdateActivityNickname 修改活动内昵称（榜单与成员名单的展示名）
// PUT /api/activity/hell-board/team/nickname
func UpdateActivityNickname(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityEnrollReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.UpdateNickname(ctx, userID, req.Nickname); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// LeaveActivityTeam 退出当前队伍（选错队伍时可退出重选）
// POST /api/activity/hell-board/team/leave
func LeaveActivityTeam(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.LeaveTeam(ctx, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]bool{"left": true})
}

// ClaimActivityCaptain 已入队成员自助补选为本队队长（队长位空缺时）
// POST /api/activity/hell-board/team/claim-captain
func ClaimActivityCaptain(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	if err := activityService.ClaimCaptain(ctx, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
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

// UpdateTeamByCaptain 队长更新队名/徽章
// PUT /api/activity/hell-board/team
func UpdateTeamByCaptain(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityTeamUpsertReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	team, err := activityService.CaptainUpdateTeam(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, team)
}

// AddTeamMemberByCaptain 队长从报名名单拉人入队
// POST /api/activity/hell-board/team/members
func AddTeamMemberByCaptain(ctx context.Context, c *app.RequestContext) {
	var req struct {
		UserID string `json:"userId"`
	}
	if err := c.BindAndValidate(&req); err != nil || req.UserID == "" {
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

// --- 运营后台 ---

// ListActivityTeams 全部队伍（运营视角）
// GET /api/activity/hell-board/admin/teams
func ListActivityTeams(ctx context.Context, c *app.RequestContext) {
	items, err := activityService.ListTeams(ctx)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]any{"items": items})
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
	dto, err := activityService.UpdateTeam(ctx, c.Param("id"), req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
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

// AddActivityMember 添加成员（自动分配彩虹色）
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

// UpdateActivityTile 调整格子定义（类型/文案/效果参数/双子）
// PUT /api/activity/hell-board/admin/tiles/:index
func UpdateActivityTile(ctx context.Context, c *app.RequestContext) {
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 1 || index > 100 {
		response.BadRequest(c, "格子编号不合法")
		return
	}
	var req types.ActivityTileUpdateReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	dto, err := activityService.UpdateTile(ctx, index, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// ManualFixActivityTeam 手工修正队伍状态（带理由留痕）
// POST /api/activity/hell-board/admin/teams/:id/manual-fix
func ManualFixActivityTeam(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityManualFixReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	dto, err := activityService.ManualFix(ctx, c.Param("id"), req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// ExportActivityResults 导出当前战况
// GET /api/activity/hell-board/admin/export
func ExportActivityResults(ctx context.Context, c *app.RequestContext) {
	result, err := activityService.ExportResults(ctx)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// --- 反馈（bug / 需求） ---

// CreateActivityFeedback 提交活动反馈
// POST /api/activity/hell-board/feedback
func CreateActivityFeedback(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityFeedbackReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := activityService.SubmitFeedback(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// ListActivityFeedback 管理员查看反馈列表
// GET /api/activity/hell-board/admin/feedback?status=pending|resolved
func ListActivityFeedback(ctx context.Context, c *app.RequestContext) {
	page, pageSize := pagination.Parse(c)
	result, err := activityService.ListFeedback(ctx, c.Query("status"), page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// ResolveActivityFeedback 管理员标记反馈已处理
// PUT /api/activity/hell-board/admin/feedback/:id
func ResolveActivityFeedback(ctx context.Context, c *app.RequestContext) {
	var req types.ActivityFeedbackResolveReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}
	dto, err := activityService.ResolveFeedback(ctx, c.Param("id"), req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}
