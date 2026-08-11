package sanction

import (
	"context"
	"errors"
	"testing"
)

// TestCanWriteEmptyUserID 回归 A4：空 userID 必须拒绝写操作。
// 这是 CanWrite 的入口校验，不依赖 DB 查询，保证未登录或异常场景下不泄漏任何写权限。
func TestCanWriteEmptyUserID(t *testing.T) {
	err := CanWrite(context.Background(), "")
	if err == nil {
		t.Fatalf("空 userID 应返回错误，实际 nil")
	}
	if !errors.Is(err, ErrForbidden) {
		t.Errorf("空 userID 应返回 ErrForbidden, got %v", err)
	}
}
