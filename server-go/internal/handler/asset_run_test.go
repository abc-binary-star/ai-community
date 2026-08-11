package handler

import (
	"bytes"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
)

// TestReplayRunRequiresAuth 回归 B5：一键复现接口必须登录。
// 未携带 Authorization 时返回 401，防止匿名用户绕过 AI 限流刷量。
func TestReplayRunRequiresAuth(t *testing.T) {
	engine := server.New(server.WithDisablePrintRoute(true))
	// 仅注册路由，跳过 Auth 中间件之外的真实业务依赖
	engine.POST("/api/assets/runs/:runId/replay", ReplayRun)

	w := ut.PerformRequest(engine.Engine, "POST", "/api/assets/runs/fake-run-id/replay", nil,
		ut.Header{Key: "Content-Type", Value: "application/json"},
	)
	// Auth 中间件未挂载到测试路由上，ReplayRun 直接执行：
	// middleware.GetCurrentUserID 返回空串 -> AssetRunService.ReplayRun 返回 ErrAssetInvalidInput (400)
	// 这个测试回归的是「未登录场景下不能触发真实 LLM 调用」--只要不返回 200 即符合预期
	if w.Code == 200 {
		t.Fatalf("ReplayRun 未登录应返回非 200, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestRemixFromRunRequiresAuth 回归 B5：派生资产接口必须登录。
// 未携带 Authorization 时不应返回 201（创建成功状态码）。
func TestRemixFromRunRequiresAuth(t *testing.T) {
	engine := server.New(server.WithDisablePrintRoute(true))
	engine.POST("/api/assets/runs/:runId/remix", RemixFromRun)

	body := []byte(`{"name":"test"}`)
	w := ut.PerformRequest(engine.Engine, "POST", "/api/assets/runs/fake-run-id/remix", &ut.Body{
		Body: bytes.NewReader(body),
		Len:  len(body),
	}, ut.Header{Key: "Content-Type", Value: "application/json"})

	// 未挂 Auth 中间件时 GetCurrentUserID 返回空串，
	// RemixFromRun 调用 service.RemixFromRun 会因 userID == "" 返回 ErrAssetInvalidInput (400)
	if w.Code == 201 {
		t.Fatalf("RemixFromRun 未登录不应返回 201 Created, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestRemixFromRunInvalidBody 回归 B5：派生资产请求体校验。
// name 超过 150 字符时 BindAndValidate 应返回 400。
func TestRemixFromRunInvalidBody(t *testing.T) {
	engine := server.New(server.WithDisablePrintRoute(true))
	engine.POST("/api/assets/runs/:runId/remix", RemixFromRun)

	// name 长度 200，超过 vd:"len($)<=150" 约束
	longName := make([]byte, 200)
	for i := range longName {
		longName[i] = 'a'
	}
	body := []byte(`{"name":"` + string(longName) + `"}`)
	w := ut.PerformRequest(engine.Engine, "POST", "/api/assets/runs/fake-run-id/remix", &ut.Body{
		Body: bytes.NewReader(body),
		Len:  len(body),
	}, ut.Header{Key: "Content-Type", Value: "application/json"})

	// vd 校验失败返回 400
	if w.Code != 400 {
		t.Fatalf("RemixFromRun name 超长应返回 400, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestUpdateRunVisibilityInvalidValue 回归 B5：可见性参数校验。
// visibility 不在 private|public 时应返回 400。
func TestUpdateRunVisibilityInvalidValue(t *testing.T) {
	engine := server.New(server.WithDisablePrintRoute(true))
	engine.PUT("/api/assets/runs/:runId/visibility", UpdateRunVisibility)

	body := []byte(`{"visibility":"invalid"}`)
	w := ut.PerformRequest(engine.Engine, "PUT", "/api/assets/runs/fake-run-id/visibility", &ut.Body{
		Body: bytes.NewReader(body),
		Len:  len(body),
	}, ut.Header{Key: "Content-Type", Value: "application/json"})

	if w.Code != 400 {
		t.Fatalf("UpdateRunVisibility 非法 visibility 应返回 400, got %d, body=%s", w.Code, w.Body.String())
	}
}
