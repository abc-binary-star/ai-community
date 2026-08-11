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

var assetService = &service.AssetService{}
var postAssetService = &service.PostAssetService{}
var assetRunService = service.NewAssetRunService()

func handleAssetError(c *app.RequestContext, err error) {
	if ae, ok := err.(*service.AssetError); ok {
		response.Error(c, ae.Code, ae.Msg)
		return
	}
	log.Printf("[Asset] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// CreateAsset 创建 AI 资产（登录用户）
// POST /api/assets
func CreateAsset(ctx context.Context, c *app.RequestContext) {
	var req types.CreateAssetReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	authorID := middleware.GetCurrentUserID(c)

	result, err := assetService.CreateAsset(ctx, req, authorID)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.Created(c, result)
}

// GetAsset 查看单个资产（可选登录）
// GET /api/assets/:id
func GetAsset(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	viewerID := middleware.GetCurrentUserID(c)

	result, err := assetService.GetAsset(ctx, id, viewerID)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListAssets 已发布资产列表（可选登录）
// GET /api/assets?authorId=&type=&tag=&keyword=&sort=&page=&pageSize=
func ListAssets(ctx context.Context, c *app.RequestContext) {
	viewerID := middleware.GetCurrentUserID(c)
	authorID := c.Query("authorId")
	assetType := c.Query("type")
	tag := c.Query("tag")
	keyword := c.Query("keyword")
	sort := c.Query("sort")
	page, pageSize := pagination.Parse(c)

	result, err := assetService.ListAssets(ctx, viewerID, authorID, assetType, tag, keyword, sort, page, pageSize)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListMyAssets 当前用户的资产（登录）
// GET /api/assets/me
func ListMyAssets(ctx context.Context, c *app.RequestContext) {
	viewerID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := assetService.ListAssetsByUser(ctx, viewerID, viewerID, page, pageSize)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// UpdateAsset 更新资产（仅作者）
// PUT /api/assets/:id
func UpdateAsset(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	viewerID := middleware.GetCurrentUserID(c)

	var req types.UpdateAssetReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	result, err := assetService.UpdateAsset(ctx, id, viewerID, req)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// DeleteAsset 删除资产（仅作者）
// DELETE /api/assets/:id
func DeleteAsset(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	viewerID := middleware.GetCurrentUserID(c)

	if err := assetService.DeleteAsset(ctx, id, viewerID); err != nil {
		handleAssetError(c, err)
		return
	}
	response.OK(c)
}

// --- 帖子-资产绑定（B2）---

// BindPostAsset 把资产挂到帖子上（帖子作者或管理员/版主）
// POST /api/posts/:id/assets
func BindPostAsset(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	operatorID := middleware.GetCurrentUserID(c)

	var req types.BindPostAssetReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	result, err := postAssetService.BindPostAsset(ctx, postID, req, operatorID)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.Created(c, result)
}

// UnbindPostAsset 解除帖子与资产的绑定（帖子作者或管理员/版主）
// DELETE /api/posts/:id/assets/:assetId
func UnbindPostAsset(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	assetID := c.Param("assetId")
	operatorID := middleware.GetCurrentUserID(c)

	if err := postAssetService.UnbindPostAsset(ctx, postID, assetID, operatorID); err != nil {
		handleAssetError(c, err)
		return
	}
	response.OK(c)
}

// ListPostAssets 列出帖子绑定的资产（可选登录）
// GET /api/posts/:id/assets?page=&pageSize=
func ListPostAssets(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	viewerID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := postAssetService.ListPostAssets(ctx, postID, viewerID, page, pageSize)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// --- 资产试玩（B3）---

// RunAsset 在线运行资产（登录，受 AI 限流）
// POST /api/assets/:id/run
func RunAsset(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	var req types.RunAssetReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	result, err := assetRunService.Run(ctx, id, userID, req)
	if err != nil {
		// LLM 错误原样透传成 503，便于前端区分「资产不存在」与「AI 暂时不可用」
		if ae, ok := err.(*service.AssetError); ok {
			handleAssetError(c, ae)
			return
		}
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, result)
}

// --- 运行快照（B4）---

// GetRun 查看单条运行快照（可选登录）
// GET /api/assets/runs/:runId
func GetRun(ctx context.Context, c *app.RequestContext) {
	runID := c.Param("runId")
	viewerID := middleware.GetCurrentUserID(c)

	result, err := assetRunService.GetRun(ctx, runID, viewerID)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListAssetRuns 列出某资产的运行快照（可选登录）
// GET /api/assets/:id/runs?page=&pageSize=
func ListAssetRuns(ctx context.Context, c *app.RequestContext) {
	assetID := c.Param("id")
	viewerID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := assetRunService.ListAssetRuns(ctx, assetID, viewerID, page, pageSize)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListMyRuns 当前用户的运行历史（登录）
// GET /api/assets/runs/me
func ListMyRuns(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := assetRunService.ListMyRuns(ctx, userID, page, pageSize)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// UpdateRunVisibility 发布/撤回运行结果分享（仅作者）
// PUT /api/assets/runs/:runId/visibility
func UpdateRunVisibility(ctx context.Context, c *app.RequestContext) {
	runID := c.Param("runId")
	userID := middleware.GetCurrentUserID(c)

	var req types.UpdateRunVisibilityReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	result, err := assetRunService.UpdateRunVisibility(ctx, runID, userID, req.Visibility)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.JSON(c, result)
}

// --- B5：结果分享与复现/Remix ---

// ReplayRun 一键复现：基于已有快照的 inputs/params 重新运行资产（登录，受 AI 限流）
// POST /api/assets/runs/:runId/replay
func ReplayRun(ctx context.Context, c *app.RequestContext) {
	runID := c.Param("runId")
	userID := middleware.GetCurrentUserID(c)

	result, err := assetRunService.ReplayRun(ctx, runID, userID)
	if err != nil {
		// LLM 错误透传成 503，与 RunAsset 一致
		if ae, ok := err.(*service.AssetError); ok {
			handleAssetError(c, ae)
			return
		}
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, result)
}

// RemixFromRun 基于运行快照派生新资产（登录）
// POST /api/assets/runs/:runId/remix
func RemixFromRun(ctx context.Context, c *app.RequestContext) {
	runID := c.Param("runId")
	userID := middleware.GetCurrentUserID(c)

	var req types.RemixFromRunReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	result, err := assetRunService.RemixFromRun(ctx, runID, userID, req)
	if err != nil {
		handleAssetError(c, err)
		return
	}
	response.Created(c, result)
}
