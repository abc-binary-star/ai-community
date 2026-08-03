package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var aiService = &service.AIService{}

// SuggestTitle AI 标题建议
// POST /api/ai/suggest-title
func SuggestTitle(ctx context.Context, c *app.RequestContext) {
	var req types.SuggestTitleReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) < 10 {
		response.BadRequest(c, "内容太短，至少 10 个字")
		return
	}
	if len([]rune(req.Content)) > 5000 {
		response.BadRequest(c, "内容太长，最多 5000 字")
		return
	}

	titles, err := aiService.SuggestTitle(ctx, req.Content)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"titles": titles})
}

// Rewrite AI 文本润色
// POST /api/ai/rewrite
func Rewrite(ctx context.Context, c *app.RequestContext) {
	var req types.RewriteReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) < 2 {
		response.BadRequest(c, "内容太短")
		return
	}
	if len([]rune(req.Content)) > 5000 {
		response.BadRequest(c, "内容太长，最多 5000 字")
		return
	}
	if len([]rune(req.Selection)) > 5000 {
		response.BadRequest(c, "选段太长，最多 5000 字")
		return
	}

	result, err := aiService.Rewrite(ctx, req.Content, req.Selection, req.Style)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"result": result})
}
