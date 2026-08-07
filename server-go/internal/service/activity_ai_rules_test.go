package service

import (
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

func testTile(taskType string, target int64) *model.ActivityTile {
	return &model.ActivityTile{Index: 1, TaskType: taskType, Target: target}
}

func TestEvaluateTitleLength(t *testing.T) {
	// 目标字数从格子文案解析（tile.Target 存的是本数），
	// 用真实文案「看十本标题为四个字的书」覆盖该解析路径
	tile := &model.ActivityTile{
		Index:    1,
		Title:    "看十本标题为四个字的书",
		TaskType: model.TaskTypeTitleLength,
		Target:   10,
	}
	cases := []struct {
		name   string
		title  string
		status string
	}{
		{"精确四字", "百年孤独", "passed"},
		{"书名号四字", "《百年孤独》", "passed"},
		{"三字差一", "活着", "unsure"},
		{"六字差二", "百年孤独传", "unsure"},
		{"八字差四", "霍乱时期的爱情", "rejected"},
		{"空书名", "", "rejected"},
		{"英文归一化", "The Godfather", "rejected"}, // thegodfather = 12 字，差 8
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := evaluateTitleLength(&model.ActivityCheckInBook{Title: c.title}, tile)
			if got.Status != c.status {
				t.Fatalf("title=%q status=%s, want %s (reason=%s)", c.title, got.Status, c.status, got.Reason)
			}
		})
	}
}

func TestEvaluateTitleLengthTwoCharTile(t *testing.T) {
	// 回归：第 11 格「看八本标题为两个字的书」中，两字标题书应直接通过，
	// 不得因 target=8（本数）被误判为「字数不符」而进入人工审核。
	tile := &model.ActivityTile{
		Index:    11,
		Title:    "看八本标题为两个字的书",
		TaskType: model.TaskTypeTitleLength,
		Target:   8,
	}
	for _, title := range []string{"活着", "《活着》"} {
		if got := evaluateTitleLength(&model.ActivityCheckInBook{Title: title}, tile); got.Status != "passed" {
			t.Fatalf("title=%q status=%s, want passed (reason=%s)", title, got.Status, got.Reason)
		}
	}
	// 三字书名差一位 → 存疑交人工
	if got := evaluateTitleLength(&model.ActivityCheckInBook{Title: "红楼梦"}, tile); got.Status != "unsure" {
		t.Fatalf("title=红楼梦 status=%s, want unsure", got.Status)
	}
}

func TestEvaluateWordCount(t *testing.T) {
	cases := []struct {
		name   string
		wc     int64
		status string
	}{
		{"正常", 150000, "passed"},
		{"偏少", 10000, "unsure"},
		{"异常高", 6000000, "unsure"},
		{"零", 0, "rejected"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := evaluateWordCount(&model.ActivityCheckInBook{WordCount: c.wc})
			if got.Status != c.status {
				t.Fatalf("wc=%d status=%s, want %s", c.wc, got.Status, c.status)
			}
		})
	}
}

func TestEvaluatePlainCount(t *testing.T) {
	if got := evaluatePlainCount(&model.ActivityCheckInBook{WordCount: 100}); got.Status != "passed" {
		t.Fatalf("want passed, got %s", got.Status)
	}
	// 纯数量格字数为选填：未填写（0）直接通过，不再走人工审核
	if got := evaluatePlainCount(&model.ActivityCheckInBook{WordCount: 0}); got.Status != "passed" {
		t.Fatalf("want passed (选填未填), got %s", got.Status)
	}
	if got := evaluatePlainCount(&model.ActivityCheckInBook{WordCount: 6_000_000}); got.Status != "unsure" {
		t.Fatalf("want unsure, got %s", got.Status)
	}
}

func TestEvaluateDuration(t *testing.T) {
	cases := []struct {
		name string
		d    int
		want string
	}{
		{"合理", 50, "passed"},
		{"零时长", 0, "rejected"},
		{"超长", 600, "unsure"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := evaluateDuration(&model.ActivityCheckInBook{DurationMinutes: c.d})
			if got.Status != c.want {
				t.Fatalf("d=%d status=%s, want %s", c.d, got.Status, c.want)
			}
		})
	}
}
