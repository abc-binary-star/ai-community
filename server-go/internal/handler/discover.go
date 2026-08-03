package handler

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var discoverService = &service.DiscoverService{}

// Discover 发现页聚合数据（跨频道热门 + 趋势话题 + 推荐用户）
func Discover(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	result, err := discoverService.Discover(ctx, userID)
	if err != nil {
		log.Printf("[Discover] 获取发现页数据失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}
