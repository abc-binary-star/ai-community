package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/cloudwego/hertz/pkg/app"
)

// Health 健康检查
func Health(ctx context.Context, c *app.RequestContext) {
	response.JSON(c, map[string]bool{"ok": true})
}
