package middleware

import (
	"context"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/jwt"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
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

// RequireRole 角色校验中间件，检查当前用户角色是否在允许列表中
func RequireRole(roles ...string) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		userID := GetCurrentUserID(c)
		if userID == "" {
			response.Error(c, consts.StatusUnauthorized, "未登录")
			c.Abort()
			return
		}
		var user model.User
		if err := dal.DB.WithContext(ctx).Select("id", "role").First(&user, "id = ?", userID).Error; err != nil {
			response.Error(c, consts.StatusUnauthorized, "用户不存在")
			c.Abort()
			return
		}
		allowed := false
		for _, r := range roles {
			if user.Role == r {
				allowed = true
				break
			}
		}
		if !allowed {
			response.Error(c, consts.StatusForbidden, "权限不足")
			c.Abort()
			return
		}
		c.Next(ctx)
	}
}
