package anchor

import (
	"testing"
)

func TestExtractParagraphs(t *testing.T) {
	md := "# 标题一\n\n第一段正文，包含 `inline` 代码。\n\n## 标题二\n\n- 列表项 A\n- 列表项 B\n\n> 这是一段引用\n\n```\ncode block\n```\n\n末尾段落。"
	paras := ExtractParagraphs(md)

	// 期望块顺序：h1, p, h2, li, li, blockquote(内含 p), p, p(末尾)
	// 注意 blockquote 会产出自身块与内层 p 块（口径对齐前端 blockText）
	tags := make([]string, 0, len(paras))
	for _, p := range paras {
		tags = append(tags, p.Tag)
	}
	wantTags := []string{"h1", "p", "h2", "li", "li", "blockquote", "p", "p"}
	if len(tags) != len(wantTags) {
		t.Fatalf("块数量 = %d (%v), want %d (%v)", len(tags), tags, len(wantTags), wantTags)
	}
	for i := range wantTags {
		if tags[i] != wantTags[i] {
			t.Errorf("块[%d] tag = %q, want %q", i, tags[i], wantTags[i])
		}
	}

	// 第一段应跳过 inline code，文本不含 "inline"
	if !contains(paras[1].Text, "第一段正文") {
		t.Errorf("第一段文本不含正文: %q", paras[1].Text)
	}
	if contains(paras[1].Text, "inline") {
		t.Errorf("第一段文本不应包含 inline code: %q", paras[1].Text)
	}

	// 代码块不应作为段落出现
	for _, p := range paras {
		if contains(p.Text, "code block") {
			t.Errorf("代码块内容泄漏为段落: %q", p.Text)
		}
	}

	// blockquote 块文本应包含引用内容（外层块含内层 p 文本）
	if !contains(paras[5].Text, "这是一段引用") {
		t.Errorf("blockquote 块文本不含引用: %q", paras[5].Text)
	}
}

func TestLocateL1(t *testing.T) {
	paras := ExtractParagraphs("第一段：这是一句可以被引用的话。\n\n第二段：无关内容。")
	sel := Selector{Exact: "可以被引用的话"}
	snap := paras[0].Text
	loc, lvl := Locate(paras, sel, snap)
	if lvl != LevelL1 {
		t.Fatalf("level = %v, want L1", lvl)
	}
	if loc.ParagraphIndex != 0 {
		t.Errorf("paragraph = %d, want 0", loc.ParagraphIndex)
	}
}

func TestLocateL3DuplicateWithPrefixSuffix(t *testing.T) {
	// 两段都含重复短文本「我认为」，靠 prefix/suffix 消歧
	md := "开头我认为这个方案不错。结尾。\n\n另一段我认为不行。"
	paras := ExtractParagraphs(md)
	// 选第二段的「我认为」，prefix 为「另一段」，suffix 为「不行」
	sel := Selector{Exact: "我认为", Prefix: "另一段", Suffix: "不行"}
	loc, lvl := Locate(paras, sel, "")
	if lvl == LevelNone {
		t.Fatal("未命中，期望 L3 消歧命中")
	}
	if loc.ParagraphIndex != 1 {
		t.Errorf("paragraph = %d, want 1（第二段）, level=%v", loc.ParagraphIndex, lvl)
	}
}

func TestLocateL3UniqueNoSnapshot(t *testing.T) {
	paras := ExtractParagraphs("唯一出现的特殊句子在这里。\n\n另一段。")
	sel := Selector{Exact: "特殊句子"}
	loc, lvl := Locate(paras, sel, "")
	if lvl != LevelL3 {
		t.Fatalf("level = %v, want L3", lvl)
	}
	if loc.ParagraphIndex != 0 {
		t.Errorf("paragraph = %d, want 0", loc.ParagraphIndex)
	}
}

func TestLocateOrphaned(t *testing.T) {
	paras := ExtractParagraphs("这段内容完全不包含目标文字。")
	sel := Selector{Exact: "不存在的引用", Prefix: "前", Suffix: "后"}
	loc, lvl := Locate(paras, sel, paras[0].Text)
	if lvl != LevelNone {
		t.Fatalf("level = %v, want LevelNone(orphaned)", lvl)
	}
	if loc != nil {
		t.Errorf("loc 应为 nil")
	}
}

func TestLocateSnapshotMismatchFallsToL3(t *testing.T) {
	// 模拟作者改了段首：创建时快照是旧段首，现在段首变了，但引用文字仍唯一存在
	md := "新的段首文字。这是唯一可引用的句子。"
	paras := ExtractParagraphs(md)
	sel := Selector{Exact: "唯一可引用的句子"}
	// 旧快照（段首已变更）
	oldSnap := "旧的段首文字。这是唯一可引用的句子。"
	loc, lvl := Locate(paras, sel, oldSnap)
	if lvl == LevelNone {
		t.Fatal("段首变更后应降级到 L3 命中，而非 orphaned")
	}
	if loc.ParagraphIndex != 0 {
		t.Errorf("paragraph = %d, want 0", loc.ParagraphIndex)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			if s[i+j] != sub[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}
