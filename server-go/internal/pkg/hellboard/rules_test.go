package hellboard

import (
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

func tile(index int) *model.ActivityTile {
	d := Tiles[index-1]
	return &model.ActivityTile{
		Index:       d.Index,
		Title:       d.Title,
		TaskType:    d.TaskType,
		Target:      d.Target,
		Unit:        d.Unit,
		SpecialRule: d.SpecialRule,
	}
}

func TestAdvanceWrapsAround(t *testing.T) {
	cases := []struct{ from, steps, want int }{
		{1, 1, 2},
		{1, 6, 7},
		{20, 1, 1},   // 第 20 格之后回到第 1 格
		{18, 5, 3},   // 跨过起点
		{20, 20, 20}, // 走满一圈回到原地
	}
	for _, c := range cases {
		if got := Advance(c.from, c.steps); got != c.want {
			t.Errorf("Advance(%d,%d) = %d, want %d", c.from, c.steps, got, c.want)
		}
	}
}

func TestCrossesStart(t *testing.T) {
	if CrossesStart(1, 6) {
		t.Error("从第 1 格走 6 步未跨起点")
	}
	if !CrossesStart(18, 5) {
		t.Error("从第 18 格走 5 步应跨起点")
	}
	if !CrossesStart(20, 1) {
		t.Error("从第 20 格走 1 步应跨起点")
	}
}

func TestMatchesRule(t *testing.T) {
	// P0-2 点数口径：低于 4 点为 ≤3，超过 3 点为 ≥4
	cases := []struct {
		kind  string
		value int
		want  bool
	}{
		{model.RuleAllOdd, 1, true},
		{model.RuleAllOdd, 2, false},
		{model.RuleAllEven, 6, true},
		{model.RuleAllEven, 3, false},
		{model.RuleAllBelow4, 3, true},
		{model.RuleAllBelow4, 4, false},
		{model.RuleAllAbove3, 4, true},
		{model.RuleAllAbove3, 3, false},
	}
	for _, c := range cases {
		if got := MatchesRule(c.kind, c.value); got != c.want {
			t.Errorf("MatchesRule(%s,%d) = %v, want %v", c.kind, c.value, got, c.want)
		}
	}
}

func TestRollDiceInRange(t *testing.T) {
	for i := 0; i < 200; i++ {
		v := RollDice()
		if v < 1 || v > DiceFaces {
			t.Fatalf("RollDice 越界: %d", v)
		}
	}
}

func TestIsTaskDonePenaltyTileNeverDone(t *testing.T) {
	// 第 8 格是惩罚而非阅读任务，不由进度达成（P1-6）
	if IsTaskDone(9999, tile(PenaltyTileIndex)) {
		t.Error("计时惩罚格不应由任务进度达成")
	}
	if !IsTaskDone(10, tile(1)) {
		t.Error("第 1 格进度 10/10 应达成")
	}
	if IsTaskDone(9, tile(1)) {
		t.Error("第 1 格进度 9/10 不应达成")
	}
}

func TestFallbackThresholdAndPenaltyExemption(t *testing.T) {
	if !IsFallbackDone(FallbackThreshold, tile(4)) {
		t.Error("本格 40 本应触发保底")
	}
	if IsFallbackDone(FallbackThreshold-1, tile(4)) {
		t.Error("39 本不应触发保底")
	}
	// 保底计数在计时惩罚格不适用（P1-6）
	if IsFallbackDone(100, tile(PenaltyTileIndex)) {
		t.Error("计时惩罚格不适用保底")
	}
}
