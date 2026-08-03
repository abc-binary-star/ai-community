package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/cloudwego/hertz/pkg/app"
)

var threadSummaryService = &service.ThreadSummaryService{}

// GetThreadSummary 获取讨论摘要 v2（要点卡 + 回链）
// GET /api/posts/:id/summary
func GetThreadSummary(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")

	result, err := threadSummaryService.GetThreadSummary(ctx, postID)
	if err != nil {
		if pe, ok := err.(*service.PostSummaryError); ok {
			response.Error(c, pe.Code, pe.Msg)
			return
		}
		response.Error(c, 500, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}

// GenerateThreadSummary 手动触发生成讨论摘要
// POST /api/posts/:id/summary
func GenerateThreadSummary(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")

	result, err := threadSummaryService.GenerateThreadSummary(ctx, postID)
	if err != nil {
		if pe, ok := err.(*service.PostSummaryError); ok {
			response.Error(c, pe.Code, pe.Msg)
			return
		}
		response.Error(c, 500, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}
