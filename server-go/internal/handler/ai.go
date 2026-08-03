package handler

import (
	"context"
	"log"

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
	if len([]rune(req.Content)) > 15000 {
		response.BadRequest(c, "内容太长，最多 15000 字")
		return
	}

	if !ai.Enabled() {
		response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
		return
	}

	titles, err := aiService.SuggestTitle(ctx, req.Content)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 标题建议失败: %v", err)
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
	if len([]rune(req.Content)) > 15000 {
		response.BadRequest(c, "内容太长，最多 15000 字")
		return
	}
	if len([]rune(req.Selection)) > 15000 {
		response.BadRequest(c, "选段太长，最多 15000 字")
		return
	}

	result, err := aiService.Rewrite(ctx, req.Content, req.Selection, req.Style)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 文本润色失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"result": result})
}

// Summarize AI 摘要生成
// POST /api/ai/summarize
func Summarize(ctx context.Context, c *app.RequestContext) {
	var req types.SummarizeReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) > 30000 {
		response.BadRequest(c, "内容太长，最多 30000 字")
		return
	}

	summary, err := aiService.Summarize(ctx, req.Content)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 摘要生成失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"summary": summary})
}

// VoicePolish AI 语音转录文本润色
// POST /api/ai/voice-polish
func VoicePolish(ctx context.Context, c *app.RequestContext) {
	var req types.VoicePolishReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) < 2 {
		response.BadRequest(c, "内容太短")
		return
	}
	if len([]rune(req.Content)) > 15000 {
		response.BadRequest(c, "内容太长，最多 15000 字")
		return
	}

	result, err := aiService.VoicePolish(ctx, req.Content, req.Style, req.Target)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 语音润色失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"result": result})
}
