package hellboard

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

// 新玩法展示层辅助：纯函数，服务端权威计算仍在本包。
// 负责引擎状态与数据库模型的互转，以及彩虹色、状态的校验与推导。

// ErrBadState 模型 JSON 字段损坏时的兜底错误
var ErrBadState = errors.New("team state corrupt")

// ValidRainbowColor 是否为七彩虹色之一
func ValidRainbowColor(c string) bool {
	for _, rc := range RainbowColors {
		if rc == c {
			return true
		}
	}
	return false
}

// TeamStateFromModel 从队伍模型重建引擎状态（colorBlocks / buffs 为 JSON 文本列）。
func TeamStateFromModel(team *model.ActivityTeam) (TeamGameState, error) {
	st := TeamGameState{
		Position:      team.Position,
		Points:        team.Points,
		UniversalDice: team.UniversalDice,
		RollChances:   team.RollChances,
		RainbowCount:  team.RainbowCount,
		WeekMinDelta:  team.WeekMinDelta,
		ColorBlocks:   map[string]int{},
	}
	if strings.TrimSpace(team.ColorBlocks) != "" {
		if err := json.Unmarshal([]byte(team.ColorBlocks), &st.ColorBlocks); err != nil {
			return st, ErrBadState
		}
	}
	if strings.TrimSpace(team.Buffs) != "" {
		if err := json.Unmarshal([]byte(team.Buffs), &st.Buffs); err != nil {
			return st, ErrBadState
		}
	}
	return st, nil
}

// ApplyTeamState 将引擎状态序列化回队伍模型字段。
func ApplyTeamState(team *model.ActivityTeam, st TeamGameState) error {
	blocks, err := json.Marshal(st.ColorBlocks)
	if err != nil {
		return err
	}
	buffs, err := json.Marshal(st.Buffs)
	if err != nil {
		return err
	}
	team.Position = st.Position
	team.Points = st.Points
	team.UniversalDice = st.UniversalDice
	team.RollChances = st.RollChances
	team.RainbowCount = st.RainbowCount
	team.WeekMinDelta = st.WeekMinDelta
	team.ColorBlocks = string(blocks)
	team.Buffs = string(buffs)
	return nil
}

// DerivedStatus 按引擎状态推导队伍状态：
// 冲线获胜 / 有掷骰机会待前进 / 集彩虹进行中。
func DerivedStatus(st TeamGameState) string {
	if HasWon(st.Position) {
		return model.TeamStatusCompleted
	}
	if st.RollChances > 0 {
		return model.TeamStatusReady
	}
	return model.TeamStatusCollecting
}

// HasEffectedStatus 队伍是否具备可写操作状态（未获胜）
func HasEffectedStatus(st TeamGameState) bool {
	return !HasWon(st.Position)
}

// FirstUnclaimedColor 返回队伍内尚未被认领的第一个彩虹色；全部被认领返回空串
func FirstUnclaimedColor(claimed map[string]bool) string {
	for _, c := range RainbowColors {
		if !claimed[c] {
			return c
		}
	}
	return ""
}

// ClaimedColorSet 队伍内已被认领的颜色集合（color → true）
func ClaimedColorSet(members []model.ActivityMember) map[string]bool {
	out := map[string]bool{}
	for _, m := range members {
		if m.Color != "" {
			out[m.Color] = true
		}
	}
	return out
}
