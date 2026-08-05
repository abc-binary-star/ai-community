package service

import "testing"

func TestSelectionContext_取前后上下文(t *testing.T) {
	content := "第一段内容。第二段是选中的部分。第三段内容。"
	selection := "第二段是选中的部分。"

	before, after := selectionContext(content, selection, 200)

	if before != "第一段内容。" {
		t.Errorf("上文错误：期望 %q，实际 %q", "第一段内容。", before)
	}
	if after != "第三段内容。" {
		t.Errorf("下文错误：期望 %q，实际 %q", "第三段内容。", after)
	}
}

func TestSelectionContext_按字数截断(t *testing.T) {
	long := ""
	for i := 0; i < 100; i++ {
		long += "填充内容"
	}
	selection := "这是选中的片段"
	content := long + selection + long

	before, after := selectionContext(content, selection, 50)

	if n := len([]rune(before)); n > 50 {
		t.Errorf("上文应截断到 50 字，实际 %d", n)
	}
	if n := len([]rune(after)); n > 50 {
		t.Errorf("下文应截断到 50 字，实际 %d", n)
	}
}

func TestSelectionContext_选段不在正文中(t *testing.T) {
	before, after := selectionContext("正文内容", "不存在的选段", 200)
	if before != "" || after != "" {
		t.Errorf("选段不在正文中时应返回空串，实际 before=%q after=%q", before, after)
	}
}

func TestSelectionContext_选段在开头或结尾(t *testing.T) {
	content := "开头选段。后面还有内容。"

	before, after := selectionContext(content, "开头选段。", 200)
	if before != "" {
		t.Errorf("选段在开头时上文应为空，实际 %q", before)
	}
	if after == "" {
		t.Error("选段在开头时下文不应为空")
	}

	before2, after2 := selectionContext(content, "后面还有内容。", 200)
	if before2 == "" {
		t.Error("选段在结尾时上文不应为空")
	}
	if after2 != "" {
		t.Errorf("选段在结尾时下文应为空，实际 %q", after2)
	}
}
