package router

import (
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/cloudwego/hertz/pkg/app/server"
)

// TestRegisterRoutes 确认全部路由能注册成功。
// Hertz 的路由树在静态段与参数段冲突时会 panic，
// 这个测试兜住新增活动路由分组引入的注册冲突。
func TestRegisterRoutes(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("路由注册 panic: %v", r)
		}
	}()

	h := server.New(server.WithDisablePrintRoute(true))
	Register(h, &conf.Config{CORSOrigins: []string{"*"}})
}
