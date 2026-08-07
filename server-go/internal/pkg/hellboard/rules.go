package hellboard

import (
	"crypto/rand"
	"math/big"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

// RollDice 生成骰子点数。用 crypto/rand 而非 math/rand，
// 避免可预测序列被用来卡点掷骰（PRD 10.3 防篡改）。
func RollDice() int {
	n, err := rand.Int(rand.Reader, big.NewInt(DiceFaces))
	if err != nil {
		// crypto/rand 失败属于系统级异常，退化为固定中间值而非 panic，
		// 保证活动不因熵源问题中断
		return 3
	}
	return int(n.Int64()) + 1
}

// IsTaskDone 任务是否达成。计时惩罚格没有阅读任务，永不由任务达成（P1-6）
func IsTaskDone(progress int64, tile *model.ActivityTile) bool {
	if tile.TaskType == model.TaskTypeTimedPenalty {
		return false
	}
	return progress >= tile.Target
}

// IsFallbackDone 保底是否达成：全队累计通过审核达 40 本即触发全局保底（P1-5）。
// 计时惩罚格不适用保底（P1-6）。
func IsFallbackDone(fallbackCount int, tile *model.ActivityTile) bool {
	if tile.TaskType == model.TaskTypeTimedPenalty {
		return false
	}
	return fallbackCount >= FallbackThreshold
}

// DeriveStatus 根据当前进度推导队伍应处状态（PRD 7.2 状态机）。
//
// 优先级：已完成 / 计时中最高，其次保底达成直接进入待掷骰
// （落在判定格时保底同时视为判定通过，无需再掷判定骰，见 PRD 7.3）。
func DeriveStatus(team *model.ActivityTeam, tile *model.ActivityTile, litCount int) string {
	if litCount >= TileCount {
		return model.TeamStatusCompleted
	}
	if team.Status == model.TeamStatusCompleted {
		return model.TeamStatusCompleted
	}
	// 计时未到期保持计时中；到期由 SettleTimer 推进，不在此处翻转
	if team.Status == model.TeamStatusTimerRunning {
		return model.TeamStatusTimerRunning
	}
	if IsFallbackDone(team.FallbackCount, tile) {
		return model.TeamStatusAwaitingRoll
	}
	if !IsTaskDone(team.TileProgress, tile) {
		return model.TeamStatusInProgress
	}
	if tile.SpecialRule != "" {
		return model.TeamStatusAwaitingJudgement
	}
	return model.TeamStatusAwaitingRoll
}

// CanSubmitCheckIn 计时中与已完成不可提交打卡（P1-6 / 验收标准 6）
func CanSubmitCheckIn(team *model.ActivityTeam) bool {
	return team.Status != model.TeamStatusTimerRunning && team.Status != model.TeamStatusCompleted
}

// TimerExpired 计时惩罚是否到期
func TimerExpired(team *model.ActivityTeam, now time.Time) bool {
	if team.Status != model.TeamStatusTimerRunning || team.TimerEndsAt == nil {
		return false
	}
	return !now.Before(*team.TimerEndsAt)
}

// EvaluateJudgement 聚合判定结果：全员点数都满足规则才通过（P0-2）。
// memberCount 为在册成员数，未全员掷完返回 false, false。
func EvaluateJudgement(kind string, values []int, memberCount int) (passed, complete bool) {
	if len(values) < memberCount {
		return false, false
	}
	for _, v := range values {
		if !MatchesRule(kind, v) {
			return false, true
		}
	}
	return true, true
}

// LitReasonFor 判断离开格子时的点亮方式。
// 任务达成优先于保底：两者同时满足时按任务达成记账，语义更贴近玩家实际路径。
func LitReasonFor(team *model.ActivityTeam, tile *model.ActivityTile) string {
	if IsTaskDone(team.TileProgress, tile) {
		return model.LitReasonTask
	}
	if IsFallbackDone(team.FallbackCount, tile) {
		return model.LitReasonFallback
	}
	return model.LitReasonTask
}
