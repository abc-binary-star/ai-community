package ailimit

import (
	"testing"
	"time"
)

func TestEffectivePlan(t *testing.T) {
	now := time.Now()
	expired := now.Add(-time.Hour)
	active := now.Add(24 * time.Hour)

	cases := []struct {
		name string
		user userSnapshot
		want string
	}{
		{"默认免费", userSnapshot{Plan: "free"}, PlanFree},
		{"订阅未到期", userSnapshot{Plan: PlanPro, PlanExpiresAt: &active}, PlanPro},
		{"订阅已到期自动降级", userSnapshot{Plan: PlanPro, PlanExpiresAt: &expired}, PlanFree},
		{"订阅无到期时间视为长期", userSnapshot{Plan: PlanPro, PlanExpiresAt: nil}, PlanPro},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := effectivePlan(tc.user); got != tc.want {
				t.Fatalf("effectivePlan(%+v) = %q, want %q", tc.user, got, tc.want)
			}
		})
	}
}

func TestRecordPlanAdmin(t *testing.T) {
	u := userSnapshot{Role: "admin", Plan: PlanFree}
	if got := recordPlan(u); got != PlanAdmin {
		t.Fatalf("recordPlan(admin) = %q, want %q", got, PlanAdmin)
	}
}

func TestDefaultConfigFreeTier(t *testing.T) {
	cfg := DefaultConfig()
	free := cfg.Plans[PlanFree]
	pro := cfg.Plans[PlanPro]

	if free.RewriteMaxRunes != 8000 {
		t.Fatalf("免费润色字数上限 = %d, want 8000", free.RewriteMaxRunes)
	}
	if pro.RewriteMaxRunes != 40000 {
		t.Fatalf("订阅润色字数上限 = %d, want 40000", pro.RewriteMaxRunes)
	}
	if free.FeatureConfigs[FeatureEnrich].MaxPerDay != 10 {
		t.Fatalf("免费 AI 补全日上限 = %d, want 10", free.FeatureConfigs[FeatureEnrich].MaxPerDay)
	}
	if pro.FeatureConfigs[FeatureEnrich].MaxPerDay != 100 {
		t.Fatalf("订阅 AI 补全日上限 = %d, want 100", pro.FeatureConfigs[FeatureEnrich].MaxPerDay)
	}
	if free.DailyTokenLimit != 100_000 {
		t.Fatalf("免费日 token 预算 = %d, want 100000", free.DailyTokenLimit)
	}
	if pro.DailyTokenLimit != 500_000 {
		t.Fatalf("订阅日 token 预算 = %d, want 500000", pro.DailyTokenLimit)
	}
}

func TestFeatureConfigFallback(t *testing.T) {
	pc := PlanConfig{FeatureConfigs: map[Feature]FeatureConfig{}}
	fc := featureConfig(pc, FeatureEnrich)
	if fc.MaxPerMinute != 5 || fc.MaxPerDay != 30 {
		t.Fatalf("未配置功能默认限制 = %+v, want {5, 30}", fc)
	}
}
