package middleware

import (
	"context"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/jwt"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/cloudwego/hertz/pkg/app"
)

// Auth JWT 强制验证中间件
func Auth() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		header := string(c.GetHeader("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			response.Unauthorized(c, "未登录")
			c.Abort()
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims := jwt.VerifyToken(token)
		if claims == nil {
			response.Unauthorized(c, "未登录或登录已过期")
			c.Abort()
			return
		}
		c.Set("userId", claims.UserID)
		c.Set("username", claims.Username)
		c.Next(ctx)
	}
}

// OptionalAuth 可选鉴权：有 token 则解析，无 token 放行
func OptionalAuth() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		header := string(c.GetHeader("Authorization"))
		if strings.HasPrefix(header, "Bearer ") {
			token := strings.TrimPrefix(header, "Bearer ")
			if claims := jwt.VerifyToken(token); claims != nil {
				c.Set("userId", claims.UserID)
				c.Set("username", claims.Username)
			}
		}
		c.Next(ctx)
	}
}

// GetCurrentUserID 从 context 提取当前 userId（可能为空字符串）
func GetCurrentUserID(c *app.RequestContext) string {
	v, exists := c.Get("userId")
	if !exists {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
