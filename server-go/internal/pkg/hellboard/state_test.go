package hellboard

import (
	"testing"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

func tileAt(index int) *TileDef {
	return TileAt(index)
}

func fixedRand() int { return 1 } // 随机源固定值，便于断言

func TestTileDistribution(t *testing.T) {
	// 官方《100格棋盘格子表》：前进 20 / 后退 20 / 双子互换 20（10 对）/ 特殊 21（含终点格）/ 空白 19
	if len(Tiles) != TileCount {
		t.Fatalf("格子数应为 %d，得到 %d", TileCount, len(Tiles))
	}
	counts := map[TileKind]int{}
	seen := map[int]bool{}
	for i := range Tiles {
		tile := Tiles[i]
		if seen[tile.Index] {
			t.Fatalf("编号 %d 重复", tile.Index)
		}
		seen[tile.Index] = true
		if tile.Index < 1 || tile.Index > TileCount {
			t.Fatalf("编号 %d 越界", tile.Index)
		}
		counts[tile.Kind]++
		if tile.Kind == TileSwap && (tile.Twin < 1 || tile.Twin > TileCount) {
			t.Fatalf("格子 %d 的双子 %d 越界", tile.Index, tile.Twin)
		}
	}
	if counts[TileSpecial] != 21 || counts[TileBlank] != 19 {
		t.Errorf("特殊格应为 21、空白格应为 19，得到 special=%d blank=%d", counts[TileSpecial], counts[TileBlank])
	}
	// 双子互指：A.twin=B 且 B.twin=A
	for i := range Tiles {
		t1 := Tiles[i]
		if t1.Kind != TileSwap {
			continue
		}
		t2 := TileAt(t1.Twin)
		if t2 == nil || t2.Twin != t1.Index {
			t.Errorf("双子 %d 与 %d 未互指", t1.Index, t1.Twin)
		}
	}
	// 终点格：第 100 格为特殊功能格（终点）
	if TileAt(100) == nil || TileAt(100).Kind != TileSpecial || TileAt(100).Title != "终点格" {
		t.Error("第 100 格应为终点格（特殊功能格）")
	}
}

func TestRollBasicMove(t *testing.T) {
	// 第 4 格为空白格：起点第 3 格，掷 1 → 第 4 格（无附加效果）
	g := &TeamGameState{Position: 3, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	out := g.Roll(1, false, tileAt, fixedRand, fixedRand)
	if out.To != 4 || out.Moved != 1 {
		t.Errorf("掷 1 应从 3 到 4，得到位置 %d 位移 %d", out.To, out.Moved)
	}
	if out.Points != OuncePointsOdd {
		t.Errorf("单数应积 %d 分，得到 %d", OuncePointsOdd, out.Points)
	}
	// 双数积 2 分：8 → 10（空白格）
	g2 := &TeamGameState{Position: 8, RollChances: 1, ColorBlocks: map[string]int{}}
	g2.ConsumeRollChance()
	out2 := g2.Roll(2, false, tileAt, fixedRand, fixedRand)
	if out2.To != 10 || out2.Points != OuncePointsEven {
		t.Errorf("掷 2 应到 10 且积 %d 分，得到位置 %d 积分 %d", OuncePointsEven, out2.To, out2.Points)
	}
}

func TestRollForwardTile(t *testing.T) {
	// 6 号格是前进2格：第 4 格起点 → 掷2 落在 6 → 额外前进2 → 位置 8
	g := &TeamGameState{Position: 4, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	out := g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g.Position != 8 {
		t.Errorf("落前进格后应到 8，得到 %d", g.Position)
	}
	if out.Moved != 4 {
		t.Errorf("该次总位移应 4，得到 %d", out.Moved)
	}
}

func TestRollBackwardTile(t *testing.T) {
	// 7 号格为后退2格：起点 5 → 掷2 落在7 → 后退2 → 位置5
	g := &TeamGameState{Position: 5, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g.Position != 5 {
		t.Errorf("后退格后应回到 5，得到 %d", g.Position)
	}
}

func TestRollSwapTile(t *testing.T) {
	// 5 号双子 12：起点 3 → 掷2 落在5 → 互换到 12
	g := &TeamGameState{Position: 3, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	out := g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g.Position != 12 {
		t.Errorf("互换格后应到 12，得到 %d", g.Position)
	}
	if out.Moved != 9 {
		t.Errorf("互换位移应 9（12-3），得到 %d", out.Moved)
	}
}

func TestWinCondition(t *testing.T) {
	// 98 → 掷 2（98 号格是后退1格，但先到达 100 已满足冲线，按到达即胜）
	g := &TeamGameState{Position: 98, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	out := g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if !out.Won || g.Position != 100 {
		t.Errorf("到达终点应获胜，得到位置 %d won=%v", g.Position, out.Won)
	}
	if st := DerivedStatus(*g); st != model.TeamStatusCompleted {
		t.Errorf("冲线后状态应为 completed，得到 %s", st)
	}
}

func TestStallBuff(t *testing.T) {
	g := &TeamGameState{Position: 3, RollChances: 1, Buffs: []Buff{{Kind: EffectStall, Uses: 1}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	out := g.Roll(4, false, tileAt, fixedRand, fixedRand)
	if g.Position != 3 || out.Moved != 0 {
		t.Errorf("冷却停滞应原地停留，位置 %d 位移 %d", g.Position, out.Moved)
	}
	if len(g.Buffs) != 0 {
		t.Error("停滞 buff 应被消耗")
	}
}

func TestRollDoubleBuff(t *testing.T) {
	g := &TeamGameState{Position: 10, RollChances: 1, Buffs: []Buff{{Kind: EffectRollDouble, Uses: 1}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(2, false, tileAt, fixedRand, fixedRand)
	// 步数翻倍：2×2=4 → 10→14
	if g.Position != 14 {
		t.Errorf("步数翻倍后应到 14，得到 %d", g.Position)
	}
}

func TestTeamAccelBuff(t *testing.T) {
	g := &TeamGameState{Position: 10, RollChances: 1, Buffs: []Buff{{Kind: EffectTeamAccel, Uses: 2}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g.Position != 14 {
		t.Errorf("全队加速 +2 应到 14，得到 %d", g.Position)
	}
	if len(g.Buffs) != 1 || g.Buffs[0].Uses != 1 {
		t.Errorf("全队加速剩余次数应为 1，得到 %+v", g.Buffs)
	}
}

func TestRollHalveBuff(t *testing.T) {
	g := &TeamGameState{Position: 8, RollChances: 1, Buffs: []Buff{{Kind: EffectRollHalve, Uses: 1}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(3, false, tileAt, fixedRand, fixedRand)
	// 步数折半：3/2=1（向下取整）→ 8→9（空白格）
	if g.Position != 9 {
		t.Errorf("步数折半后应到 9，得到 %d", g.Position)
	}
}

func TestImmunityVsBackward(t *testing.T) {
	// 无损通行：踩到后退格失效，停在原地
	g := &TeamGameState{Position: 5, RollChances: 1, Buffs: []Buff{{Kind: EffectImmunity, Uses: 1}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g.Position != 7 {
		t.Errorf("无损通行应停在 7（后退失效），得到 %d", g.Position)
	}
	// 惩罚免疫（永久 buff）：同样生效
	g2 := &TeamGameState{Position: 5, RollChances: 1, Buffs: []Buff{{Kind: EffectImmunityBuff, Uses: 1}}, ColorBlocks: map[string]int{}}
	g2.ConsumeRollChance()
	g2.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g2.Position != 7 {
		t.Errorf("惩罚免疫应停在 7，得到 %d", g2.Position)
	}
}

func TestFateForwardBuffKillsForward(t *testing.T) {
	// 运势走低：踩中前进格（6 号，前进2格）额外效果失效，停在 6
	g := &TeamGameState{Position: 4, RollChances: 1, Buffs: []Buff{{Kind: EffectFateBackward, Uses: 1}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g.Position != 6 {
		t.Errorf("运势走低应停在 6（前进效果失效），得到 %d", g.Position)
	}
}

func TestGuaranteedAdvanceTile(t *testing.T) {
	// 50 号格保底冲刺：掷 1 停 50 → 触发保底前进 4 → 54
	g := &TeamGameState{Position: 49, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(1, false, tileAt, fixedRand, fixedRand)
	if g.Position != 54 {
		t.Errorf("保底冲刺应到 54，得到 %d", g.Position)
	}
	// 掷 4（>2）不触发：46 → 50 停在原地
	g2 := &TeamGameState{Position: 46, RollChances: 1, ColorBlocks: map[string]int{}}
	g2.ConsumeRollChance()
	g2.Roll(4, false, tileAt, fixedRand, fixedRand)
	if g2.Position != 50 {
		t.Errorf("掷 4 不触发保底，应停在 50，得到 %d", g2.Position)
	}
}

func TestEndDecelTile(t *testing.T) {
	// 94 号终点减速：回到原来的位置（93 → 94 → 退回 93）
	g := &TeamGameState{Position: 93, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(1, false, tileAt, fixedRand, fixedRand)
	if g.Position != 93 {
		t.Errorf("终点减速应退回 93，得到 %d", g.Position)
	}
}

func TestPointsAutoExchange(t *testing.T) {
	g := &TeamGameState{Position: 0, Points: 8, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(6, true, tileAt, fixedRand, fixedRand) // 万能骰子 +2 分
	if g.Points != 0 {
		t.Errorf("10 分应兑换后归零，得到 %d", g.Points)
	}
	if g.UniversalDice != 1 {
		t.Errorf("应兑换 1 枚万能骰子，得到 %d", g.UniversalDice)
	}
}

func TestPointsModifiers(t *testing.T) {
	// 积分暴击：落 9 号格（point-double），本次积分 ×2
	g := &TeamGameState{Position: 8, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	out := g.Roll(1, false, tileAt, fixedRand, fixedRand)
	if out.Points != 2 {
		t.Errorf("积分暴击应积 2 分（1×2），得到 %d", out.Points)
	}
	// 积分低迷：落 15 号格（point-flat）统一 1 分
	g2 := &TeamGameState{Position: 14, RollChances: 1, ColorBlocks: map[string]int{}}
	g2.ConsumeRollChance()
	out2 := g2.Roll(1, false, tileAt, fixedRand, fixedRand)
	if out2.Points != 1 {
		t.Errorf("积分低迷应统一积 1 分，得到 %d", out2.Points)
	}
	// 积分倒扣：落 35 号格（point-minus-2）先累计本次积分再从已有积分扣除
	g3 := &TeamGameState{Position: 34, Points: 3, RollChances: 1, ColorBlocks: map[string]int{}}
	g3.ConsumeRollChance()
	g3.Roll(1, false, tileAt, fixedRand, fixedRand)
	if g3.Points != 2 {
		t.Errorf("积分倒扣后应剩 2 分（3+1-2），得到 %d", g3.Points)
	}
}

func TestUniversalDiceIgnoresTile(t *testing.T) {
	// 起点 0 万能骰子掷 2：落到 2（前进1格），但万能骰子无视格子效果 → 停在 2 而非 3
	g := &TeamGameState{Position: 0, UniversalDice: 1, ColorBlocks: map[string]int{}}
	out := g.UseUniversalDice(2, tileAt, fixedRand, fixedRand)
	if g.Position != 2 {
		t.Errorf("万能骰子应停在 2（无视前进格），得到 %d", g.Position)
	}
	if g.UniversalDice != 0 {
		t.Error("万能骰子应被消耗")
	}
	if out.Points != OuncePointsEven {
		t.Errorf("万能骰子积分应照常累计 %d，得到 %d", OuncePointsEven, out.Points)
	}
}

func TestSealDiceBlock(t *testing.T) {
	g := &TeamGameState{Position: 0, UniversalDice: 1, Buffs: []Buff{{Kind: EffectSealDice, Uses: 1}}, ColorBlocks: map[string]int{}}
	// 封印存在时不可使用
	if ok, sealed := g.CanUseUniversalDice(); ok || !sealed {
		t.Errorf("封印存在时应 blocked，得到 ok=%v sealed=%v", ok, sealed)
	}
	g.UseUniversalDice(2, tileAt, fixedRand, fixedRand)
	if g.Position != 0 {
		t.Errorf("被封印时不应移动，得到位置 %d", g.Position)
	}
	if g.UniversalDice != 1 {
		t.Error("被封印时不应消耗万能骰子")
	}
	// 封印用一次后清零即解除
	if ok, _ := g.CanUseUniversalDice(); !ok {
		t.Error("封印消耗后应可再使用")
	}
	g.UseUniversalDice(2, tileAt, fixedRand, fixedRand)
	if g.UniversalDice != 0 {
		t.Error("第二次使用应消耗万能骰子")
	}
}

func TestDropDiceEffect(t *testing.T) {
	// 42 号格道具掉落：+1 万能骰子（从 41 掷 1 落在 42）
	g := &TeamGameState{Position: 41, RollChances: 1, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(1, false, tileAt, fixedRand, fixedRand)
	if g.UniversalDice != 1 {
		t.Errorf("道具掉落应 +1 万能骰子，得到 %d", g.UniversalDice)
	}
}

func TestUnyieldingBackTile(t *testing.T) {
	// 70 号格随机回荡：无条件额外后退 2 格（即使有无损通行也照常后退）
	g := &TeamGameState{Position: 66, RollChances: 1, Buffs: []Buff{{Kind: EffectImmunity, Uses: 1}}, ColorBlocks: map[string]int{}}
	g.ConsumeRollChance()
	g.Roll(4, false, tileAt, fixedRand, fixedRand)
	if g.Position != 68 {
		t.Errorf("随机回荡应后退到 68（无视免疫），得到 %d", g.Position)
	}
	// 与普通后退格对比：无损通行对第 7 格（后退2）仍生效
	g2 := &TeamGameState{Position: 5, RollChances: 1, Buffs: []Buff{{Kind: EffectImmunity, Uses: 1}}, ColorBlocks: map[string]int{}}
	g2.ConsumeRollChance()
	g2.Roll(2, false, tileAt, fixedRand, fixedRand)
	if g2.Position != 7 {
		t.Errorf("无损通行应停在 7（后退失效），得到 %d", g2.Position)
	}
}

func TestGrantCycle(t *testing.T) {
	g := &TeamGameState{Position: 0, ColorBlocks: map[string]int{}}
	g.GrantCycle()
	if g.RollChances != 1 || g.RainbowCount != 1 {
		t.Errorf("集齐彩虹应 +1 机会，得到 chances=%d rainbow=%d", g.RollChances, g.RainbowCount)
	}
	if st := DerivedStatus(*g); st != model.TeamStatusReady {
		t.Errorf("有机会应为 ready，得到 %s", st)
	}
	// 彩虹加成 +1 / 卡顿 -1
	g2 := &TeamGameState{
		Position:    0,
		Buffs:       []Buff{{Kind: EffectRainbowBonus, Uses: 1}, {Kind: EffectRainbowStall, Uses: 1}},
		ColorBlocks: map[string]int{},
	}
	g2.GrantCycle()
	if g2.RollChances != 1 {
		t.Errorf("加成与卡顿抵消后应为 1，得到 %d", g2.RollChances)
	}
}

func TestConsumeRollChance(t *testing.T) {
	g := &TeamGameState{RollChances: 1}
	if !g.ConsumeRollChance() || g.RollChances != 0 {
		t.Error("应成功消耗唯一机会")
	}
	if g.ConsumeRollChance() {
		t.Error("无机会不应消耗成功")
	}
}

func TestStateSerialization(t *testing.T) {
	team := &model.ActivityTeam{}
	st := TeamGameState{
		Position:      12,
		Points:        7,
		UniversalDice: 2,
		RollChances:   1,
		RainbowCount:  3,
		WeekMinDelta:  -1,
		ColorBlocks:   map[string]int{"red": 1, "purple": 2},
		Buffs:         []Buff{{Kind: EffectRollDouble, Uses: 1}},
	}
	if err := ApplyTeamState(team, st); err != nil {
		t.Fatalf("序列化失败: %v", err)
	}
	got, err := TeamStateFromModel(team)
	if err != nil {
		t.Fatalf("反序列化失败: %v", err)
	}
	if got.Position != 12 || got.Points != 7 || got.UniversalDice != 2 || got.RollChances != 1 || got.RainbowCount != 3 {
		t.Errorf("状态不一致: %+v", got)
	}
	if got.ColorBlocks["purple"] != 2 || len(got.Buffs) != 1 {
		t.Errorf("JSON 字段不一致: %+v", got)
	}
}

func TestValidRainbowColor(t *testing.T) {
	for _, c := range RainbowColors {
		if !ValidRainbowColor(c) {
			t.Errorf("%s 应为合法彩虹色", c)
		}
	}
	if ValidRainbowColor("pink") {
		t.Error("pink 不应是合法彩虹色")
	}
}

func TestCycleRangeSeptember(t *testing.T) {
	start, end := CycleRange(2026)
	if start.Month() != time.September || start.Day() != 1 {
		t.Errorf("周期应始于 9 月 1 日，得到 %v", start)
	}
	if end.Month() != time.September || end.Day() != 30 {
		t.Errorf("周期应止于 9 月 30 日，得到 %v", end)
	}
	in := time.Date(2026, time.September, 15, 12, 0, 0, 0, cycleLocation)
	if IsArchived(in) || !IsCycleStarted(in) {
		t.Error("9 月中不应归档且应已开始")
	}
	after := time.Date(2026, time.October, 1, 0, 0, 0, 0, cycleLocation)
	if !IsArchived(after) {
		t.Error("10 月后应归档")
	}
}

func TestDedupKeyNormalization(t *testing.T) {
	a := DedupKey("m1", "《活着》", "余华")
	b := DedupKey("m1", " 活着 ", "余华")
	if a != b {
		t.Errorf("归一化后应相同:\n%s\n%s", a, b)
	}
}
