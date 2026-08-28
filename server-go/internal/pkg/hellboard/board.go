// Package hellboard 活动「九月彩虹桥 · 读书大富翁」的棋盘规则引擎。
//
// 这里是纯函数层，不依赖数据库与 HTTP，便于单测覆盖活动规则的状态机边界。
// 服务端权威要求：掷骰点数、队伍前进、格子效果结算、积分与万能骰子兑换、
// 胜负判定全部由本包计算，前端不持有可影响结果的逻辑。
//
// 玩法概览（与旧版「无限循环读书地狱」完全不同）：
//
//   - 全队 7 人固定，每人认领一种彩虹色（红橙黄绿青蓝紫），一人一色不重复；
//   - 读完的书封面主色调与认领颜色一致即为有效「色块」；全队集齐 7 色 =
//     完成一轮通关，获得 1 次掷骰前进机会；
//   - 棋盘共 100 格，均分五类：前进格 / 后退格 / 特殊功能格 / 位置互换格 / 空白格；
//   - 掷骰 1–6 点决定前进步数；单数积 1 分、双数积 2 分，每满 10 分自动兑换
//     1 枚可叠加、无期限的「万能骰子」（无视当前格子效果）；
//   - 任意队伍率先走完 100 格获胜。
package hellboard

import "github.com/abc-binary-star/ai-community/server-go/internal/model"

// TileCount 棋盘总格数，1–100，第 100 格为终点格
const TileCount = 100

// DiceFaces 六面骰
const DiceFaces = 6

// MaxTeamSize 队伍固定满编 7 人，对应 7 种彩虹色
const MaxTeamSize = 7

// WinTile 到达该格即冲线获胜
const WinTile = 100

// PointsPerUniversalDice 团队积分每满 10 分自动兑换 1 枚万能骰子
const PointsPerUniversalDice = 10

// OuncePointsOdd / OuncePointsEven 掷出单数积 1 分、双数积 2 分
const (
	OuncePointsOdd  = 1
	OuncePointsEven = 2
)

// WeeklyRainbowGuarantee 每周每队保底彩虹条数（兜底规则，防摆烂）
const WeeklyRainbowGuarantee = 4

// RainbowColors 七种彩虹色，顺序即认领固定序
var RainbowColors = []string{
	model.RainbowColorRed, model.RainbowColorOrange, model.RainbowColorYellow,
	model.RainbowColorGreen, model.RainbowColorCyan, model.RainbowColorBlue,
	model.RainbowColorPurple,
}

// TileKind 格子类型：100 格均分五类，每类 20 格
type TileKind string

const (
	// TileForward 前进格：踩到额外前进（多为固定 1–3 格）
	TileForward TileKind = "forward"
	// TileBackward 后退格：踩到触发后退惩罚
	TileBackward TileKind = "backward"
	// TileSpecial 特殊功能格：各格有各自的特殊功能
	TileSpecial TileKind = "special"
	// TileSwap 位置互换格：与「双子格」进行位置交换
	TileSwap TileKind = "swap"
	// TileBlank 空白格：无奖励无惩罚，平稳过渡
	TileBlank TileKind = "blank"
)

// EffectKey 特殊功能格的效果标识。
// 效果分两类：落地即结算（影响本次掷骰的步数 / 积分），或追加为队伍 Buff
// （影响后续掷骰 / 后续彩虹周期），Buff 次数见 EffectLabel。
type EffectKey string

const (
	// EffectGuaranteedAdvance 保底冲刺：本次掷骰若 ≤2 步，直接保底前进 4 格
	EffectGuaranteedAdvance EffectKey = "guaranteed-advance"
	// EffectRollDouble 步数翻倍：下一次掷骰最终步数 ×2
	EffectRollDouble EffectKey = "roll-double"
	// EffectImmunity 无损通行：下一轮行走所有负面格子（后退）失效
	EffectImmunity EffectKey = "immunity"
	// EffectColorOrphan 色块空缺：下一轮集彩虹需多补读 1 本书才可通关
	EffectColorOrphan EffectKey = "color-orphan"
	// EffectRainbowStall 彩虹卡顿：下一轮集齐彩虹少 1 次掷骰机会
	EffectRainbowStall EffectKey = "rainbow-stall"
	// EffectRainbowBonus 彩虹加成：下一轮集齐彩虹额外多 1 次掷骰机会
	EffectRainbowBonus EffectKey = "rainbow-bonus"
	// EffectPointDouble 积分暴击：本次骰子积分双倍结算
	EffectPointDouble EffectKey = "point-double"
	// EffectPointFlat 积分低迷：本次掷骰无论单双统一只积 1 分
	EffectPointFlat EffectKey = "point-flat"
	// EffectPointMinus2 积分倒扣：扣除当前团队积分 2 分
	EffectPointMinus2 EffectKey = "point-minus-2"
	// EffectTeamAccel 全队加速：接下来两次掷骰固定 +2 步数
	EffectTeamAccel EffectKey = "team-accel"
	// EffectRollHalve 步数折半：本次掷骰最终行走步数减半（向下取整）
	EffectRollHalve EffectKey = "roll-halve"
	// EffectStall 冷却停滞：下一轮掷骰无效，原地停留一回合
	EffectStall EffectKey = "stall"
	// EffectDropDice 道具掉落：全队直接赠送万能骰子 ×1
	EffectDropDice EffectKey = "drop-dice"
	// EffectSealDice 道具封印：本局暂时禁止使用万能骰子 1 次
	EffectSealDice EffectKey = "seal-dice"
	// EffectImmunityBuff 惩罚免疫：永久保存 1 次「后退格无效」免疫 buff
	EffectImmunityBuff EffectKey = "immunity-buff"
	// EffectLuckyChoose 幸运三选一：随机获得 万能骰子 / 免费彩虹 / 积分+5 其一
	EffectLuckyChoose EffectKey = "lucky-choose"
	// EffectFateBackward 运势走低：下一次踩中前进格，额外前进效果直接失效
	EffectFateBackward EffectKey = "fate-backward"
	// EffectEndDecel 终点减速：退回原来的位置
	EffectEndDecel EffectKey = "end-decel"
	// EffectBottomQuota 保底扩容：团队本周最低彩虹保底条数 -1
	EffectBottomQuota EffectKey = "bottom-quota"
	// EffectUnyieldingBack 随机回荡：无条件额外后退 2 格（无视无损通行/惩罚免疫）
	EffectUnyieldingBack EffectKey = "unyielding-back"
)

// EffectLabels 特殊功能格的面向用户文案，语义即规则：
// 以「本次 / 下一次 / 接下来 / 下一轮 / 永久」区分结算时机与 Buff 次数。
var EffectLabels = map[EffectKey]string{
	EffectGuaranteedAdvance: "保底冲刺：本次掷骰若≤2步，直接保底前进4格",
	EffectRollDouble:        "步数翻倍：下一次掷骰最终步数×2",
	EffectImmunity:          "无损通行：下一轮行走所有负面格子（后退格）失效",
	EffectColorOrphan:       "色块空缺：下一轮集彩虹需多补读1本书才可通关",
	EffectRainbowStall:      "彩虹卡顿：下一轮集齐彩虹少1次掷骰机会",
	EffectRainbowBonus:      "彩虹加成：下一轮集齐彩虹额外多1次掷骰机会",
	EffectPointDouble:       "积分暴击：本次骰子积分双倍结算",
	EffectPointFlat:         "积分低迷：本次掷骰无论单双统一只积1分",
	EffectPointMinus2:       "积分倒扣：扣除当前团队积分2分",
	EffectTeamAccel:         "全队加速：接下来两次掷骰固定+2步数",
	EffectRollHalve:         "步数折半：本次掷骰最终行走步数减半（向下取整）",
	EffectStall:             "冷却停滞：下一轮掷骰无效，原地停留一回合",
	EffectDropDice:          "道具掉落：全队直接赠送万能骰子×1",
	EffectSealDice:          "道具封印：本局暂时禁止使用万能骰子1次",
	EffectImmunityBuff:      "惩罚免疫：永久保存1次「后退格无效」免疫buff",
	EffectLuckyChoose:       "幸运三选一：随机获得 万能骰子/免费彩虹/积分+5 其一",
	EffectFateBackward:      "运势走低：下一次踩中前进格，额外前进效果直接失效",
	EffectEndDecel:          "终点减速：退回原来的位置",
	EffectBottomQuota:       "保底扩容：团队本周最低彩虹保底条数-1",
	EffectUnyieldingBack:    "随机回荡：无条件额外后退 2 格",
}

// TileDef 格子静态定义；数据来自运营配置（本轮活动图），引擎不做硬编码。
type TileDef struct {
	Index int      `json:"index"`
	Kind  TileKind `json:"kind"`
	// Title 面向用户的格子名（如「额外前进2格」「双子互换格5&12」「终点格」），空则按类型兜底
	Title string `json:"title,omitempty"`
	// Effect 特殊功能格的效果标识；多余字段
	Effect EffectKey `json:"effect,omitempty"`
	// Param 效果参数：前进/后退格数为格数（0 表示随机 1–3），保底扩容为调整值
	Param int `json:"param,omitempty"`
	// Twin 双子格编号（位置互换格使用）
	Twin int `json:"twin,omitempty"`
}

// DefaultTileTitle 按类型生成格子兜底标题，用于运营未填 Title 时的展示
func (t *TileDef) DefaultTitle() string {
	switch t.Kind {
	case TileForward:
		if t.Param > 0 {
			return "前进" + chineseNum(t.Param) + "格"
		}
		return "额外前进 1–3 格"
	case TileBackward:
		if t.Param > 0 {
			return "后退" + chineseNum(t.Param) + "格"
		}
		return "后退 1–3 格"
	case TileSwap:
		return "位置互换格"
	case TileSpecial:
		if t.Effect != "" {
			return EffectLabels[t.Effect]
		}
		return "特殊功能"
	case TileBlank:
		return "空白格"
	}
	return "空白格"
}

func chineseNum(n int) string {
	if n <= 0 {
		return "零"
	}
	digits := []string{"", "一", "二", "三", "四", "五", "六", "七", "八", "九"}
	switch {
	case n < 10:
		return digits[n]
	case n < 20:
		s := "十"
		if n%10 != 0 {
			s += digits[n%10]
		}
		return s
	case n < 100:
		s := digits[n/10] + "十"
		if n%10 != 0 {
			s += digits[n%10]
		}
		return s
	default:
		return "一百"
	}
}

// Buff 队伍持久效果。Uses 为剩余生效次数；多数 Buff 在生效后次数减一，
// Uses 减到 0 时移除。
type Buff struct {
	Kind EffectKey `json:"kind"`
	Uses int       `json:"uses"`
}

// BuffLabel 面向用户的 Buff 文案
func BuffLabel(b Buff) string {
	if s, ok := EffectLabels[b.Kind]; ok {
		return s
	}
	return string(b.Kind)
}

// TeamGameState 纯函数层使用的队伍可变状态，由服务端从模型构造/回写。
type TeamGameState struct {
	// Position 当前所在格编号 0–100；0 = 起点（未出发），100 = 终点（冲线）
	Position int
	// Points 团队积累积分，每满 PointsPerUniversalDice 自动兑换后保留余数
	Points int
	// UniversalDice 万能骰子持有数：可叠加、无期限、不占彩虹次数
	UniversalDice int
	// RollChances 掷骰前进机会：每集齐一次完整彩虹 +1
	RollChances int
	// RainbowCount 已完成的彩虹周期总数
	RainbowCount int
	// ColorBlocks 当前彩虹周期内各颜色色块数（红橙黄绿青蓝紫）
	ColorBlocks map[string]int
	// Buffs 生效中的持久效果列表
	Buffs []Buff
	// WeekMinDelta 本周彩虹保底条数修正（保底扩容 -1）
	WeekMinDelta int
}

// Move 前进 from + steps 步后的落点（0 起点，上限 WinTile）
func Move(from, steps int) int {
	if from+steps < 0 {
		return 0
	}
	if from+steps > WinTile {
		return WinTile
	}
	return from + steps
}

// HasWon 到达/越过第 100 格即获胜
func HasWon(position int) bool {
	return position >= WinTile
}

// PointsForRoll 单次掷骰的基础积分：单数 1 分，双数 2 分
func PointsForRoll(value int) int {
	if value%2 == 0 {
		return OuncePointsEven
	}
	return OuncePointsOdd
}

// FindBuff 查找首个指定 buff，返回下标；不存在返回 -1
func (g *TeamGameState) FindBuff(kind EffectKey) int {
	for i, b := range g.Buffs {
		if b.Kind == kind {
			return i
		}
	}
	return -1
}

// consumeBuff 使用一次 buff：次数减一，用尽后移除
func (g *TeamGameState) consumeBuff(kind EffectKey) {
	i := g.FindBuff(kind)
	if i < 0 {
		return
	}
	g.Buffs[i].Uses--
	if g.Buffs[i].Uses <= 0 {
		g.Buffs = append(g.Buffs[:i], g.Buffs[i+1:]...)
	}
}

// giveBuff 追加/叠加一个 buff
func (g *TeamGameState) giveBuff(kind EffectKey, uses int) {
	if i := g.FindBuff(kind); i >= 0 {
		g.Buffs[i].Uses += uses
		return
	}
	g.Buffs = append(g.Buffs, Buff{Kind: kind, Uses: uses})
}

// ColorCompleted 当前周期内已点亮（≥1 个色块）的颜色数
func (g *TeamGameState) ColorCompleted() int {
	n := 0
	for _, c := range RainbowColors {
		if g.ColorBlocks[c] > 0 {
			n++
		}
	}
	return n
}

// NeedBlocks 本轮通关所需色块总数：基础 7（每人一色）+ 色块空缺补读 1 本
func (g *TeamGameState) NeedBlocks() int {
	need := len(RainbowColors)
	if g.FindBuff(EffectColorOrphan) >= 0 {
		need++
	}
	return need
}

// AccumulateBlocks 记录一个有效色块。入参为已判定的「颜色」，
// 只允许点亮成员认领色（跨色复用由审核层拦截）。
func (g *TeamGameState) AccumulateBlocks(color string, n int) {
	if g.ColorBlocks == nil {
		g.ColorBlocks = map[string]int{}
	}
	g.ColorBlocks[color] += n
}

// GrantCycle 声明完成一轮彩虹通关（非打卡链路：群里读完集齐后在 App 内登记）。
// 基础 +1 次掷骰机会，并按 buff 修正：彩虹加成 +1、彩虹卡顿 -1；
// 同时消耗色块空缺 buff。集齐后的颜色周期视为重新开始。
func (g *TeamGameState) GrantCycle() int {
	chances := 1
	if g.FindBuff(EffectRainbowBonus) >= 0 {
		chances++
		g.consumeBuff(EffectRainbowBonus)
	}
	if g.FindBuff(EffectRainbowStall) >= 0 {
		chances--
		g.consumeBuff(EffectRainbowStall)
	}
	if g.FindBuff(EffectColorOrphan) >= 0 {
		g.consumeBuff(EffectColorOrphan)
	}
	if chances > 0 {
		g.RollChances += chances
	}
	g.RainbowCount++
	if g.ColorBlocks == nil {
		g.ColorBlocks = map[string]int{}
	}
	for c := range g.ColorBlocks {
		g.ColorBlocks[c] = 0
	}
	return chances
}

// TryCompleteRainbow 尝试结算一轮彩虹通关。
// 返回是否通关；通关时按 Buff 修正掷骰机会并重置当前周期色块。
// bonus/stall 同时存在时机会数为 1 + 加成 - 卡顿（下限 0）。
func (g *TeamGameState) TryCompleteRainbow() bool {
	total := 0
	for _, n := range g.ColorBlocks {
		total += n
	}
	if g.ColorCompleted() < len(RainbowColors) || total < g.NeedBlocks() {
		return false
	}
	chances := 1
	if g.FindBuff(EffectRainbowBonus) >= 0 {
		chances++
		g.consumeBuff(EffectRainbowBonus)
	}
	if g.FindBuff(EffectRainbowStall) >= 0 {
		chances--
		g.consumeBuff(EffectRainbowStall)
	}
	if g.FindBuff(EffectColorOrphan) >= 0 {
		g.consumeBuff(EffectColorOrphan)
	}
	if chances > 0 {
		g.RollChances += chances
	}
	g.RainbowCount++
	// 新一轮重新分配颜色，色块清零
	g.ColorBlocks = map[string]int{}
	return true
}

// ExchangePoints 积分满额自动兑换万能骰子；返回本次兑换枚数
func (g *TeamGameState) ExchangePoints() int {
	if g.Points <= 0 {
		return 0
	}
	exchanged := g.Points / PointsPerUniversalDice
	if exchanged <= 0 {
		return 0
	}
	g.Points %= PointsPerUniversalDice
	g.UniversalDice += exchanged
	return exchanged
}

// Roll 结算一次掷骰并落地：
//   - steps 为本次骰子点数（服务端生成，1–6）；
//   - ignoreTile 为万能骰子：无视当前格子的效果；
//   - tileAt 按格号取格子定义（nil 视为空白）；
//   - randStep 生成随机前进/后退格数（Param=0 时用 1–3）；
//   - randLucky 幸运三选一随机源。
//
// 返回本次掷骰的完整结算结果。
func (g *TeamGameState) Roll(steps int, ignoreTile bool, tileAt func(int) *TileDef, randStep func() int, randLucky func() int) *RollOutcome {
	out := &RollOutcome{DiceValue: steps, From: g.Position, Effects: []string{}}

	// 冷却停滞：下一轮掷骰无效，原地停留一回合（积分照常累计，不落地）
	if g.FindBuff(EffectStall) >= 0 {
		g.consumeBuff(EffectStall)
		base := PointsForRoll(steps)
		g.Points += base
		g.ExchangePoints()
		out.Moved = 0
		out.Points = base
		out.To = g.Position
		out.Results = []string{"冷却停滞：本次掷骰无效，原地停留一回合"}
		out.Team = *g
		out.Won = HasWon(g.Position)
		return out
	}

	// 骰前 buff 修正步数
	effective := steps
	if g.FindBuff(EffectRollDouble) >= 0 {
		effective *= 2
		g.consumeBuff(EffectRollDouble)
		out.Results = append(out.Results, "步数翻倍 ×2")
	}
	if g.FindBuff(EffectTeamAccel) >= 0 {
		effective += 2
		g.consumeBuff(EffectTeamAccel)
		out.Results = append(out.Results, "全队加速 +2 步")
	}
	if g.FindBuff(EffectRollHalve) >= 0 {
		effective /= 2
		if effective < 1 {
			effective = 1
		}
		g.consumeBuff(EffectRollHalve)
		out.Results = append(out.Results, "步数折半")
	}
	effective = max(effective, 1)

	from := g.Position
	to := Move(from, effective)
	g.Position = to
	out.To = to

	// 万能骰子无视当前格子效果，仅累计基础积分
	if ignoreTile {
		out.Moved = g.Position - from
		g.Points += PointsForRoll(steps)
		ex := g.ExchangePoints()
		out.Points = PointsForRoll(steps)
		out.DiceExchanged = ex
		out.Results = append(out.Results, "万能骰子：无视格子效果")
		out.Team = *g
		out.Won = HasWon(g.Position)
		return out
	}

	// 落地格子效果结算
	tile := tileAt(to)
	if tile != nil {
		out.Landed = tile
		out.Effects = append(out.Effects, string(tile.Kind))
		g.applyTileEffect(tile, steps, out, tileAt, randStep, randLucky)
	}

	// 积分结算（先按格子效果修正积分，再尝试兑换）
	base := PointsForRoll(steps)
	earned := base
	if out.PointMultiplier > 1 {
		earned = base * out.PointMultiplier
	}
	if out.PointFlat {
		earned = 1
	}
	if earned > 0 {
		g.Points += earned
	}
	if out.PointMinus > 0 {
		g.Points = max(0, g.Points-out.PointMinus)
	}
	ex := g.ExchangePoints()
	out.Points = earned
	out.DiceExchanged = ex

	// 位移统一以最终位置与起点之差记（含格子附加效果）
	out.Moved = g.Position - from
	out.Team = *g
	out.Won = HasWon(g.Position)
	return out
}

// consumeExpired 清理已用尽的 buff；返回随之产生的提示（当前无文案则空）
func (g *TeamGameState) consumeExpired() []string {
	kept := g.Buffs[:0]
	var notes []string
	for _, b := range g.Buffs {
		if b.Uses <= 0 {
			notes = append(notes, "效果已结束："+BuffLabel(b))
			continue
		}
		kept = append(kept, b)
	}
	g.Buffs = kept
	return notes
}

// applyTileEffect 落地格效果结算。特殊功能格外最终都归结为：
// 移动 / 积分修正 / 追加 buff / 道具 / 彩虹周期修正。
func (g *TeamGameState) applyTileEffect(tile *TileDef, rollSteps int, out *RollOutcome, tileAt func(int) *TileDef, randStep func() int, randLucky func() int) {
	switch tile.Kind {
	case TileForward:
		steps := tile.Param
		if steps <= 0 {
			steps = randStep()
		}
		// 运势走低：下一次踩中前进格，额外前进效果直接失效
		if g.FindBuff(EffectFateBackward) >= 0 {
			g.consumeBuff(EffectFateBackward)
			out.Results = append(out.Results, "运势走低：前进格额外效果失效")
			return
		}
		if steps > 0 {
			g.Position = Move(g.Position, steps)
			out.Results = append(out.Results, "前进格：额外前进"+chineseNum(steps)+"格")
		}
	case TileBackward:
		steps := tile.Param
		if steps <= 0 {
			steps = randStep()
		}
		// 无损通行（本轮生效）与惩罚免疫（永久保存的一次）互斥使用
		if g.FindBuff(EffectImmunity) >= 0 {
			g.consumeBuff(EffectImmunity)
			out.Results = append(out.Results, "无损通行：后退格失效")
			return
		}
		if g.FindBuff(EffectImmunityBuff) >= 0 {
			g.consumeBuff(EffectImmunityBuff)
			out.Results = append(out.Results, "惩罚免疫：本后退格失效")
			return
		}
		if steps > 0 {
			g.Position = Move(g.Position, -steps)
			out.Results = append(out.Results, "后退格：后退"+chineseNum(steps)+"格")
		}
	case TileSwap:
		if tile.Twin > 0 && tile.Twin != tile.Index {
			g.Position = tile.Twin
			out.Results = append(out.Results, "位置互换：与第"+chineseNum(tile.Twin)+"格互换位置")
		}
	case TileSpecial:
		g.applySpecialEffect(tile, rollSteps, out, randLucky)
	case TileBlank:
		// 无奖励无惩罚，平稳过渡
	}
}

// applySpecialEffect 特殊功能格的效果分发
func (g *TeamGameState) applySpecialEffect(tile *TileDef, rollSteps int, out *RollOutcome, randLucky func() int) {
	give := func(k EffectKey, uses int) {
		g.giveBuff(k, uses)
		out.Results = append(out.Results, EffectLabels[k])
	}
	switch tile.Effect {
	case EffectGuaranteedAdvance:
		if rollSteps <= 2 {
			g.Position = Move(g.Position, 4)
			out.Moved += 4
			out.Results = append(out.Results, "保底冲刺：保底前进4格")
		} else {
			out.Results = append(out.Results, "保底冲刺未触发")
		}
	case EffectPointDouble:
		out.PointMultiplier = 2
		out.Results = append(out.Results, EffectLabels[EffectPointDouble])
	case EffectPointFlat:
		out.PointFlat = true
		out.Results = append(out.Results, EffectLabels[EffectPointFlat])
	case EffectPointMinus2:
		out.PointMinus = 2
		out.Results = append(out.Results, EffectLabels[EffectPointMinus2])
	case EffectDropDice:
		g.UniversalDice++
		out.Results = append(out.Results, "道具掉落：万能骰子+1")
	case EffectImmunityBuff:
		give(EffectImmunityBuff, 1)
	case EffectSealDice:
		give(EffectSealDice, 1)
	case EffectStall:
		give(EffectStall, 1)
	case EffectRollDouble:
		give(EffectRollDouble, 1)
	case EffectRollHalve:
		give(EffectRollHalve, 1)
	case EffectTeamAccel:
		give(EffectTeamAccel, 2)
	case EffectImmunity:
		give(EffectImmunity, 1)
	case EffectColorOrphan:
		give(EffectColorOrphan, 1)
	case EffectRainbowStall:
		give(EffectRainbowStall, 1)
	case EffectRainbowBonus:
		give(EffectRainbowBonus, 1)
	case EffectFateBackward:
		give(EffectFateBackward, 1)
	case EffectLuckyChoose:
		switch randLucky() % 3 {
		case 0:
			g.UniversalDice++
			out.Results = append(out.Results, "幸运三选一：获得万能骰子×1")
		case 1:
			g.RollChances++
			g.RainbowCount++
			out.Results = append(out.Results, "幸运三选一：获得免费彩虹（+1 掷骰机会）")
		case 2:
			g.Points += 5
			g.ExchangePoints()
			out.Results = append(out.Results, "幸运三选一：积分+5")
		}
	case EffectEndDecel:
		if out.From >= 0 {
			g.Position = Move(out.From, 0)
			out.Moved = g.Position - out.From
			out.Results = append(out.Results, "终点减速：退回原来的位置")
		}
	case EffectBottomQuota:
		g.WeekMinDelta--
		out.Results = append(out.Results, EffectLabels[EffectBottomQuota])
	case EffectUnyieldingBack:
		// 无条件：即使有无损通行/惩罚免疫也照常后退 2 格
		g.Position = Move(g.Position, -2)
		out.Results = append(out.Results, EffectLabels[EffectUnyieldingBack])
	case "":
		out.Results = append(out.Results, "特殊功能格")
	default:
		out.Results = append(out.Results, "特殊功能格")
	}
}

// RollOutcome 一次掷骰的完整结算结果
type RollOutcome struct {
	// DiceValue 骰子面值 1–6
	DiceValue int
	// From / To 结算后的队伍位置
	From int
	To   int
	// Moved 队伍实际净前进格数（含格子附加效果，可为负）
	Moved int
	// Landed 落地格（可能为 nil）
	Landed *TileDef
	// Points 本次净增积分（未扣减已兑换的万能骰子）
	Points int
	// DiceExchanged 本次自动兑换的万能骰子数
	DiceExchanged int
	// PointMultiplier 积分暴击倍率
	PointMultiplier int
	// PointFlat 积分低迷：统一积 1 分
	PointFlat bool
	// PointMinus 积分倒扣值
	PointMinus int
	// Results 逐条效果文案（前端动效与时间线直接消费）
	Results []string
	// Effects 命中的格子类型清单（兼容旧字段名，供前端映射）
	Effects []string
	// Won 是否冲线获胜
	Won bool
	// Team 结算后的队伍快照
	Team TeamGameState
}

// ConsumeRollChance 消耗一次掷骰前进机会；不存在时返回 false
func (g *TeamGameState) ConsumeRollChance() bool {
	if g.RollChances <= 0 {
		return false
	}
	g.RollChances--
	return true
}

// CanUseUniversalDice 是否可立即使用万能骰子（持有且未被封印）
func (g *TeamGameState) CanUseUniversalDice() (ok bool, sealed bool) {
	if g.UniversalDice <= 0 {
		return false, false
	}
	if g.FindBuff(EffectSealDice) >= 0 {
		return false, true
	}
	return true, false
}

// UseUniversalDice 结算一次万能骰子：
// 被道具封印时返回 sealed=true 且扣除封印效果，视为本次使用被禁止。
func (g *TeamGameState) UseUniversalDice(steps int, tileAt func(int) *TileDef, randStep func() int, randLucky func() int) *RollOutcome {
	if g.FindBuff(EffectSealDice) >= 0 {
		g.consumeBuff(EffectSealDice)
		return &RollOutcome{DiceValue: steps, From: g.Position, To: g.Position, Points: 0, Results: []string{"道具封印：禁止使用万能骰子，封印效果已消耗"}, Team: *g}
	}
	if g.UniversalDice <= 0 {
		return &RollOutcome{DiceValue: steps, From: g.Position, To: g.Position, Points: 0, Results: []string{"没有可用的万能骰子"}, Team: *g}
	}
	g.UniversalDice--
	return g.Roll(steps, true, tileAt, randStep, randLucky)
}
