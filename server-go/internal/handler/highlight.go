package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
)

var highlightService = &service.HighlightService{}

// CreateHighlight 创建划线
// POST /api/posts/:id/highlights
func CreateHighlight(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	var req types.CreateHighlightReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	h, err := highlightService.CreateHighlight(ctx, postID, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, h)
}

// ListHighlights 获取当前用户在某帖子的划线列表
// GET /api/posts/:id/highlights
func ListHighlights(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	items, err := highlightService.ListHighlights(ctx, postID, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{"items": items})
}

// DeleteHighlight 删除划线
// DELETE /api/posts/:id/highlights/:highlightId
func DeleteHighlight(ctx context.Context, c *app.RequestContext) {
	highlightID := c.Param("highlightId")
	userID := middleware.GetCurrentUserID(c)

	if err := highlightService.DeleteHighlight(ctx, highlightID, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// UpdateHighlight 更新划线颜色
// PUT /api/posts/:id/highlights/:highlightId
func UpdateHighlight(ctx context.Context, c *app.RequestContext) {
	highlightID := c.Param("highlightId")
	var req types.UpdateHighlightReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	h, err := highlightService.UpdateHighlightColor(ctx, highlightID, userID, req.Color)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, h)
}
