package middleware

import (
	"context"
	"sync"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

// uploadLimiter 简单的内存滑动窗口限流器，防止用户恶意刷上传
type uploadLimiter struct {
	mu     sync.Mutex
	window map[string][]time.Time // userID -> 请求时间戳列表
}

var uploader = &uploadLimiter{
	window: make(map[string][]time.Time),
}

const (
	uploadWindow    = time.Minute // 时间窗口
	uploadMaxPerMin = 40          // 每窗口最大请求数
)

// UploadLimit 上传频率限制中间件：每用户每分钟最多 40 次上传
// 管理员账号不受限制
func UploadLimit() app.HandlerFunc {
	// 定期清理过期记录
	go uploader.cleanup()

	return func(ctx context.Context, c *app.RequestContext) {
		userID := GetCurrentUserID(c)
		if userID == "" {
			response.Unauthorized(c, "未登录")
			c.Abort()
			return
		}

		// 管理员不受上传限流
		var user model.User
		if err := dal.DB.WithContext(ctx).Select("role").First(&user, "id = ?", userID).Error; err == nil {
			if user.Role == "admin" {
				c.Next(ctx)
				return
			}
		}

		if !uploader.allow(userID) {
			response.Error(c, consts.StatusTooManyRequests, "上传过于频繁，请稍后再试")
			c.Abort()
			return
		}
		c.Next(ctx)
	}
}

// allow 检查用户是否在上传频率限制内
func (ul *uploadLimiter) allow(userID string) bool {
	ul.mu.Lock()
	defer ul.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-uploadWindow)

	// 过滤掉窗口外的旧记录
	times := ul.window[userID]
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= uploadMaxPerMin {
		ul.window[userID] = valid
		return false
	}

	ul.window[userID] = append(valid, now)
	return true
}

// cleanup 定期清理过期记录，防止内存无限增长
func (ul *uploadLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		ul.mu.Lock()
		cutoff := time.Now().Add(-uploadWindow)
		for userID, times := range ul.window {
			valid := times[:0]
			for _, t := range times {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(ul.window, userID)
			} else {
				ul.window[userID] = valid
			}
		}
		ul.mu.Unlock()
	}
}
