package hellboard

import (
	"testing"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

func TestDeriveStatusPlainTile(t *testing.T) {
	// 普通格：进度未达标 → 进行中；达标且无判定 → 待掷骰
	team := &model.ActivityTeam{Position: 1, Status: model.TeamStatusInProgress, TileProgress: 5}
	if got := DeriveStatus(team, tile(1), 0); got != model.TeamStatusInProgress {
		t.Errorf("进度 5/10 应为进行中，得到 %s", got)
	}
	team.TileProgress = 10
	if got := DeriveStatus(team, tile(1), 0); got != model.TeamStatusAwaitingRoll {
		t.Errorf("进度达标且无判定应为待掷骰，得到 %s", got)
	}
}

func TestDeriveStatusSpecialTileNeedsJudgement(t *testing.T) {
	// 第 4 格带 all-odd 判定：达标后进入待判定而非直接待掷骰
	team := &model.ActivityTeam{Position: 4, Status: model.TeamStatusInProgress, TileProgress: 6}
	if got := DeriveStatus(team, tile(4), 0); got != model.TeamStatusAwaitingJudgement {
		t.Errorf("判定格达标应为待判定，得到 %s", got)
	}
}

func TestDeriveStatusFallbackDoesNotAutoAdvance(t *testing.T) {
	// 保底满 40 本不再自动改变状态：任务未完成时保持进行中，
	// 由队长点「消耗 40 本向下一格进发」按钮手动触发（不绕过判定）。
	team := &model.ActivityTeam{
		Position:      4,
		Status:        model.TeamStatusInProgress,
		TileProgress:  0,
		FallbackCount: FallbackThreshold,
	}
	if got := DeriveStatus(team, tile(4), 0); got != model.TeamStatusInProgress {
		t.Errorf("保底满 40 但任务未完成应保持进行中（等待手动触发），得到 %s", got)
	}
	// 任务完成后保底计数不影响状态机：判定格仍需判定
	team.TileProgress = 6
	if got := DeriveStatus(team, tile(4), 0); got != model.TeamStatusAwaitingJudgement {
		t.Errorf("判定格任务达标应进入待判定，得到 %s", got)
	}
}

func TestDeriveStatusTimerAndCompleted(t *testing.T) {
	// 计时中不因进度变化被翻转（P1-6）
	team := &model.ActivityTeam{Position: PenaltyTileIndex, Status: model.TeamStatusTimerRunning}
	if got := DeriveStatus(team, tile(PenaltyTileIndex), 5); got != model.TeamStatusTimerRunning {
		t.Errorf("计时中应保持，得到 %s", got)
	}
	// 20 格全点亮即已完成（验收标准 7）
	done := &model.ActivityTeam{Position: 1, Status: model.TeamStatusInProgress}
	if got := DeriveStatus(done, tile(1), TileCount); got != model.TeamStatusCompleted {
		t.Errorf("全部点亮应为已完成，得到 %s", got)
	}
}

func TestCanSubmitCheckIn(t *testing.T) {
	// 计时期间无法添加任何打卡（验收标准 6）
	if CanSubmitCheckIn(&model.ActivityTeam{Status: model.TeamStatusTimerRunning}) {
		t.Error("计时中不应允许打卡")
	}
	if CanSubmitCheckIn(&model.ActivityTeam{Status: model.TeamStatusCompleted}) {
		t.Error("已完成不应允许打卡")
	}
	if !CanSubmitCheckIn(&model.ActivityTeam{Status: model.TeamStatusInProgress}) {
		t.Error("进行中应允许打卡")
	}
}

func TestEvaluateJudgementAllMustMatch(t *testing.T) {
	// 全员都投出奇数才通过；一人偶数即失败（P0-2）
	passed, complete := EvaluateJudgement(model.RuleAllOdd, []int{1, 3, 5}, 3)
	if !complete || !passed {
		t.Errorf("全奇数应通过，得到 passed=%v complete=%v", passed, complete)
	}
	passed, complete = EvaluateJudgement(model.RuleAllOdd, []int{1, 3, 2}, 3)
	if !complete || passed {
		t.Errorf("含偶数应失败，得到 passed=%v complete=%v", passed, complete)
	}
	// 未全员掷完不算完成，不能提前判失败
	passed, complete = EvaluateJudgement(model.RuleAllOdd, []int{1, 3}, 3)
	if complete || passed {
		t.Errorf("未全员掷完不应完成，得到 passed=%v complete=%v", passed, complete)
	}
}

func TestTimerExpired(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Minute)
	future := now.Add(time.Hour)
	if !TimerExpired(&model.ActivityTeam{Status: model.TeamStatusTimerRunning, TimerEndsAt: &past}, now) {
		t.Error("到期时间已过应判到期")
	}
	if TimerExpired(&model.ActivityTeam{Status: model.TeamStatusTimerRunning, TimerEndsAt: &future}, now) {
		t.Error("未到期不应判到期")
	}
	if TimerExpired(&model.ActivityTeam{Status: model.TeamStatusInProgress}, now) {
		t.Error("非计时状态不应判到期")
	}
}

func TestDedupKeyNormalization(t *testing.T) {
	// 《活着》与 活着 应视为同一本书（PRD 8.1）
	a := DedupKey("m1", "《活着》", "余华")
	b := DedupKey("m1", " 活着 ", "余华")
	if a != b {
		t.Errorf("归一化后应相同:\n%s\n%s", a, b)
	}
	// 不同成员各自独立计数
	if DedupKey("m1", "活着", "余华") == DedupKey("m2", "活着", "余华") {
		t.Error("不同成员的查重键不应相同")
	}
	// 不同书不应撞键
	if DedupKey("m1", "活着", "余华") == DedupKey("m1", "许三观卖血记", "余华") {
		t.Error("不同书目的查重键不应相同")
	}
}

func TestCycleRangeAndArchive(t *testing.T) {
	start, end := CycleRange(2026)
	if start.Month() != time.August || start.Day() != 1 {
		t.Errorf("周期应始于 8 月 1 日，得到 %v", start)
	}
	if end.Month() != time.August || end.Day() != 31 {
		t.Errorf("周期应止于 8 月 31 日，得到 %v", end)
	}
	// 8 月内不归档，9 月归档（P1-7）
	inCycle := time.Date(2026, time.August, 15, 12, 0, 0, 0, cycleLocation)
	if IsArchived(inCycle) {
		t.Error("周期内不应归档")
	}
	if !IsCycleStarted(inCycle) {
		t.Error("周期内应已开始")
	}
	after := time.Date(2026, time.September, 1, 0, 0, 0, 0, cycleLocation)
	if !IsArchived(after) {
		t.Error("周期结束后应归档")
	}
}
