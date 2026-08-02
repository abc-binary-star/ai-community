package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/cloudwego/hertz/pkg/app"
)

var postSummaryService = &service.PostSummaryService{}

// GetPostSummary 获取帖子讨论摘要（AI 生成）
// GET /api/posts/:id/summary
func GetPostSummary(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")

	result, err := postSummaryService.GetSummary(ctx, postID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	// 未达到生成条件时返回 null，前端不展示
	if result == nil || !result.Eligible {
		response.JSON(c, nil)
		return
	}
	response.JSON(c, result)
}
