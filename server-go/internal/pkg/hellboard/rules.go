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

// MarshalTeamState 序列化引擎状态为 JSON 快照，掷骰落库前保存，供撤回时还原。
func MarshalTeamState(st TeamGameState) (string, error) {
	b, err := json.Marshal(st)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// TeamStateFromJSON 从 JSON 快照还原引擎状态，与 TeamStateFromModel 同口径兜底。
func TeamStateFromJSON(s string) (TeamGameState, error) {
	var st TeamGameState
	if strings.TrimSpace(s) == "" {
		return st, ErrBadState
	}
	if err := json.Unmarshal([]byte(s), &st); err != nil {
		return st, ErrBadState
	}
	if st.ColorBlocks == nil {
		st.ColorBlocks = map[string]int{}
	}
	return st, nil
}

// LegacyRollFacts 从时间线事件解析出的旧掷骰结算要素（解析不到时为零值/false）
type LegacyRollFacts struct {
	// Earned 本次净得分（来自「团队积分 +X」事件）
	Earned int
	// PointsAfter 兑换后积分余数（同一事件里的「当前 Y」）
	PointsAfter int
	// Exchanged 本次自动兑换的万能骰子数
	Exchanged int
	// HasPoints 是否解析到积分事件；false 时只能按基础分近似回退
	HasPoints bool
}

// buffRefundByConsumedText 消耗回补：结果文案 → 本次掷骰用掉的 buff，撤回应补回。
var buffRefundByConsumedText = map[string]EffectKey{
	"步数翻倍 ×2":             EffectRollDouble,
	"全队加速 +2 步":           EffectTeamAccel,
	"步数折半":                EffectRollHalve,
	"无损通行：后退格失效":          EffectImmunity,
	"惩罚免疫：本后退格失效":         EffectImmunityBuff,
	"运势走低：前进格额外效果失效":      EffectFateBackward,
	"冷却停滞：本次掷骰无效，原地停留一回合": EffectStall,
}

// buffRefundByGrantedText 获得回收：结果文案 → 本次掷骰发出的 buff，撤回应收回。
var buffRefundByGrantedText = map[string]EffectKey{
	EffectLabels[EffectRollDouble]:   EffectRollDouble,
	EffectLabels[EffectRollHalve]:    EffectRollHalve,
	EffectLabels[EffectTeamAccel]:    EffectTeamAccel,
	EffectLabels[EffectImmunity]:     EffectImmunity,
	EffectLabels[EffectImmunityBuff]: EffectImmunityBuff,
	EffectLabels[EffectSealDice]:     EffectSealDice,
	EffectLabels[EffectColorOrphan]:  EffectColorOrphan,
	EffectLabels[EffectRainbowStall]: EffectRainbowStall,
	EffectLabels[EffectRainbowBonus]: EffectRainbowBonus,
	EffectLabels[EffectFateBackward]: EffectFateBackward,
	EffectLabels[EffectBottomQuota]:  EffectBottomQuota,
}

// revertBuff 收回 buff：次数减一，减到 0 移除；不存在则忽略。
func (g *TeamGameState) revertBuff(kind EffectKey) {
	i := g.FindBuff(kind)
	if i < 0 {
		return
	}
	g.Buffs[i].Uses--
	if g.Buffs[i].Uses <= 0 {
		g.Buffs = append(g.Buffs[:i], g.Buffs[i+1:]...)
	}
}

// RevertLegacyRoll 对没有状态快照的旧掷骰记录做尽力还原：从记录的结算文案与
// 时间线积分事件反推各项变化并回退。位置由调用方按记录 FromTile 直接还原。
// 已知盲区：解析不到的事件与历史 buff 叠加只能近似，偏差由运营手工修正兜底。
func RevertLegacyRoll(g *TeamGameState, diceValue int, isUniversal bool, resultSummary string, facts LegacyRollFacts) {
	// 积分：解析到事件时 = 兑换前积分 − 本次得分；否则只扣基础分（格效修正近似）
	if facts.HasPoints {
		g.Points = max(0, facts.PointsAfter+PointsPerUniversalDice*facts.Exchanged-facts.Earned)
	} else {
		g.Points = max(0, g.Points-PointsForRoll(diceValue))
	}
	// 万能骰子与道具：使用返还，兑换/掉落/幸运获得收回
	if isUniversal {
		g.UniversalDice++
	}
	g.UniversalDice = max(0, g.UniversalDice-facts.Exchanged)
	if strings.Contains(resultSummary, "道具掉落") {
		g.UniversalDice = max(0, g.UniversalDice-1)
	}
	if strings.Contains(resultSummary, "幸运三选一：获得万能骰子") {
		g.UniversalDice = max(0, g.UniversalDice-1)
	}
	// 免费彩虹：机会与轮数一并回退
	if strings.Contains(resultSummary, "获得免费彩虹") {
		g.RollChances = max(0, g.RollChances-1)
		g.RainbowCount = max(0, g.RainbowCount-1)
	}
	// 普通掷骰消耗过 1 次掷骰机会，返还
	if !isUniversal {
		g.RollChances++
	}
	// buff 与保底修正逐条回退
	for _, part := range strings.Split(resultSummary, "；") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if kind, ok := buffRefundByConsumedText[part]; ok {
			g.giveBuff(kind, 1)
			continue
		}
		if kind, ok := buffRefundByGrantedText[part]; ok {
			if kind == EffectBottomQuota {
				g.WeekMinDelta++
				continue
			}
			g.revertBuff(kind)
		}
	}
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

// bookkeepingEvents 成员记账类事件：由入队、换色这类编排动作自身必然产生，
// 不代表队伍真实对战进展。计入会导致「一入队就再也退不出」。
var bookkeepingEvents = map[string]bool{
	model.EventTypeColor: true,
}

// IsProgressEvent 时间线事件是否代表本队已开始对战。
// 未知事件类型按进展处理（宁可拦住），避免新增记账类型时被误放行。
func IsProgressEvent(eventType string) bool {
	return !bookkeepingEvents[eventType]
}

// BookkeepingEventTypes 记账类事件类型列表，供 SQL `type NOT IN ?` 过滤复用，
// 保证库内计数与 IsProgressEvent 同一口径。
func BookkeepingEventTypes() []string {
	out := make([]string, 0, len(bookkeepingEvents))
	for t := range bookkeepingEvents {
		out = append(out, t)
	}
	return out
}

// TeamHasProgress 队伍是否已产生真实对战进展（出发、积分、掷骰机会、色块、buff、冲线）。
// 事件行是 best-effort 写入（调用处忽略错误），故以队伍状态为准做兜底口径。
func TeamHasProgress(team *model.ActivityTeam) bool {
	if team == nil {
		return false
	}
	if team.Position != 0 || team.Points != 0 || team.UniversalDice != 0 ||
		team.RollChances != 0 || team.RainbowCount != 0 || team.WeekMinDelta != 0 ||
		team.ChampionAt != nil || team.Status != model.TeamStatusCollecting {
		return true
	}
	st, err := TeamStateFromModel(team)
	if err != nil {
		return true // 状态 JSON 无法判定，按已进展处理避免误放行
	}
	for _, n := range st.ColorBlocks {
		if n > 0 {
			return true
		}
	}
	return len(st.Buffs) > 0
}
