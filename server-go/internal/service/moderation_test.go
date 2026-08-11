package service

import (
	"context"
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// newDryRunDBForSanction 构造 DryRun 模式的 GORM 实例，仅生成 SQL 不执行。
// 用于回归 ApplySanction 入参校验逻辑，避免依赖真实数据库。
func newDryRunDBForSanction(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN: "postgres://unused:unused@127.0.0.1:1/unused?sslmode=disable",
	}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("failed to open dry-run db: %v", err)
	}
	return db.Session(&gorm.Session{DryRun: true})
}

// TestApplySanctionInvalidAction 回归 A4：处罚 action 必须是 warning/mute/suspend/ban 之一。
// 非法 action 在查询用户之前就应被拒绝，不会触发 DB 查询。
func TestApplySanctionInvalidAction(t *testing.T) {
	dal.DB = newDryRunDBForSanction(t)
	svc := &SanctionService{}

	cases := []struct {
		name   string
		action string
	}{
		{"空字符串", ""},
		{"未知类型", "kick"},
		{"大小写不匹配", "BAN"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.ApplySanction(context.Background(), types.ApplySanctionReq{
				Action:       tc.action,
				DurationDays: 1,
				Username:     "someone",
			}, "admin-1")
			if err != ErrSanctionInvalidInput {
				t.Errorf("非法 action=%q 应返回 ErrSanctionInvalidInput, got %v", tc.action, err)
			}
		})
	}
}

// TestApplySanctionNegativeDuration 回归 A4：非 warning 处罚的 durationDays 不能为负。
func TestApplySanctionNegativeDuration(t *testing.T) {
	dal.DB = newDryRunDBForSanction(t)
	svc := &SanctionService{}

	cases := []struct {
		name     string
		action   string
		duration int
	}{
		{"mute 负时长", model.ModerationActionMute, -1},
		{"suspend 负时长", model.ModerationActionSuspend, -7},
		{"ban 负时长", model.ModerationActionBan, -30},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.ApplySanction(context.Background(), types.ApplySanctionReq{
				Action:       tc.action,
				DurationDays: tc.duration,
				Username:     "someone",
			}, "admin-1")
			if err != ErrSanctionInvalidInput {
				t.Errorf("action=%s duration=%d 应返回 ErrSanctionInvalidInput, got %v",
					tc.action, tc.duration, err)
			}
		})
	}
}

// TestApplySanctionWarningAllowsZeroDuration 回归 A4：warning 处罚允许 durationDays=0。
// warning 不限制账号状态，durationDays 字段对它无意义，校验应直接放行到用户查询阶段。
// DryRun DB 查不到用户会返回错误，但不应是 ErrSanctionInvalidInput。
func TestApplySanctionWarningAllowsZeroDuration(t *testing.T) {
	dal.DB = newDryRunDBForSanction(t)
	svc := &SanctionService{}

	_, err := svc.ApplySanction(context.Background(), types.ApplySanctionReq{
		Action:       model.ModerationActionWarning,
		DurationDays: 0,
		Username:     "someone",
	}, "admin-1")
	// warning + duration=0 应通过入口校验，进入用户查询阶段
	if err == ErrSanctionInvalidInput {
		t.Errorf("warning + duration=0 不应返回 ErrSanctionInvalidInput: %v", err)
	}
}
