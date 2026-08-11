package handler

import (
	"bytes"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
)

// TestCreateCommentGone 回归 A3：评论写入口已下线（讨论模型收口），
// 必须返回 410 Gone 而不是创建成功，防止旧客户端重新写评论。
func TestCreateCommentGone(t *testing.T) {
	engine := server.New(server.WithDisablePrintRoute(true))
	engine.POST("/api/posts/:id/comments", CreateComment)

	body := []byte(`{"content":"hello"}`)
	w := ut.PerformRequest(engine.Engine, "POST", "/api/posts/abc/comments", &ut.Body{
		Body: bytes.NewReader(body),
		Len:  len(body),
	}, ut.Header{Key: "Content-Type", Value: "application/json"})

	if w.Code != 410 {
		t.Fatalf("CreateComment 应返回 410 Gone, got %d, body=%s", w.Code, w.Body.String())
	}
}
