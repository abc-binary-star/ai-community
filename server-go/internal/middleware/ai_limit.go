package middleware

import (
	"context"
	"strconv"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ailimit"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

// AILimit AI 接口限流中间件。
// 在 Auth 之后使用，根据 userID + feature 检查速率限制和每日配额。
// 管理员账号不受限制（由 ailimit.Limiter.Check 内部判断）。
func AILimit(feature ailimit.Feature) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		userID := GetCurrentUserID(c)
		if userID == "" {
			response.Unauthorized(c, "未登录")
			c.Abort()
			return
		}

		limiter := ailimit.Get()
		if limiter == nil {
			// 限制器未初始化，放行（降级模式）
			c.Next(ctx)
			return
		}

		result := limiter.Check(ctx, userID, feature)
		if !result.Allowed {
			c.Header("Retry-After", formatRetryAfter(result.RetryAfter))
			response.Error(c, consts.StatusTooManyRequests, result.Reason)
			c.Abort()
			return
		}

		c.Next(ctx)
	}
}

// formatRetryAfter 将秒数转为字符串
func formatRetryAfter(seconds int) string {
	if seconds <= 0 {
		return "60"
	}
	return strconv.Itoa(seconds)
}
