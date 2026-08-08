package service

import (
	"strings"
	"testing"
)

func TestPickExcerpt_取最长正文段落(t *testing.T) {
	content := "# 一个标题\n\n短句。\n\n这是一段明显更长的正文，它承载了实际的判断和论证，应该被选为摘录。\n\n又一句短的。"
	excerpt, anc := pickExcerpt(content)

	if !strings.Contains(excerpt, "承载了实际的判断") {
		t.Fatalf("应选中最长正文段落，实际得到: %q", excerpt)
	}
	if strings.Contains(excerpt, "一个标题") {
		t.Errorf("标题不应作为摘录，实际得到: %q", excerpt)
	}
	if anc == "" {
		t.Error("锚点不应为空，否则摘录卡无法定位段落")
	}
}

func TestPickExcerpt_锚点为段落首40字符(t *testing.T) {
	// 构造一个超过 40 字符的段落，验证锚点口径与前端 ANCHOR_LEN 对齐
	para := "这是一段足够长的正文内容用来验证锚点截断口径是否与前端保持一致否则点击摘录卡之后无法定位到原文段落"
	excerpt, anc := pickExcerpt(para)

	ancRunes := []rune(anc)
	if len(ancRunes) != ideaAnchorRunes {
		t.Fatalf("锚点应为 %d 个字符，实际 %d", ideaAnchorRunes, len(ancRunes))
	}
	if !strings.HasPrefix(excerpt, anc) {
		t.Error("锚点应为摘录的前缀")
	}
	// 与前端 blockText(e).trim().slice(0, 40) 口径一致
	expected := string([]rune(para)[:ideaAnchorRunes])
	if anc != expected {
		t.Errorf("锚点口径不一致\n期望: %q\n实际: %q", expected, anc)
	}
}

func TestPickExcerpt_摘录长度受限(t *testing.T) {
	long := strings.Repeat("很长的正文内容", 100)
	excerpt, _ := pickExcerpt(long)

	if n := len([]rune(excerpt)); n > ideaExcerptMaxRunes {
		t.Errorf("摘录应截断到 %d 字符以内，实际 %d", ideaExcerptMaxRunes, n)
	}
}

func TestPickExcerpt_空内容与纯标题不产出卡(t *testing.T) {
	if excerpt, _ := pickExcerpt(""); excerpt != "" {
		t.Errorf("空正文不应产出摘录，实际: %q", excerpt)
	}
	if excerpt, _ := pickExcerpt("# 只有标题\n\n## 还是标题"); excerpt != "" {
		t.Errorf("纯标题不应产出摘录，实际: %q", excerpt)
	}
}

func TestTruncateRunes_不切坏多字节字符(t *testing.T) {
	s := "中文字符测试"
	got := truncateRunes(s, 3)
	if got != "中文字" {
		t.Errorf("期望 %q，实际 %q", "中文字", got)
	}
	if truncateRunes(s, 100) != s {
		t.Error("长度不足时应原样返回")
	}
}
