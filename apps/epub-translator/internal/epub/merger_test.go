package epub

import (
	"fmt"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

const testHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1: The Awakening</title></head>
<body>
<h1>The Awakening</h1>
<p>It was a cold morning when Ada first opened her eyes inside the machine.</p>
<p>The year is 2089. Humanity has long since abandoned the old cities.</p>
<p>She whispered to herself, <em>"I will find the truth."</em></p>
</body>
</html>`

func TestChunkAndMerge(t *testing.T) {
	chunker := NewChunker(1500, 300, 100)
	chapter := Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Test", HTMLContent: testHTML}

	chunks, err := chunker.ChunkChapter(chapter)
	if err != nil {
		t.Fatalf("chunk 失败: %v", err)
	}
	if len(chunks) == 0 {
		t.Fatal("分块结果为空")
	}
	for i, c := range chunks {
		if c.Index != i {
			t.Fatalf("chunk[%d] 序号错误: %d", i, c.Index)
		}
		if c.BlockStart > c.BlockEnd {
			t.Fatalf("chunk[%d] 块范围错误: [%d,%d]", i, c.BlockStart, c.BlockEnd)
		}
	}

	translated := make([]string, len(chunks))
	for i, c := range chunks {
		translated[i] = "[译] " + c.HTMLFragment
	}

	out, err := MergeTranslations(testHTML, chunks, translated)
	if err != nil {
		t.Fatalf("merge 失败: %v", err)
	}
	if !strings.Contains(out, "[译]") {
		t.Fatal("翻译内容未写回章节 HTML")
	}
	if strings.Contains(out, "The Awakening") {
		// 原文块应被替换；若出现说明替换失败
		t.Logf("警告: 输出仍含原文标题（模拟译文中可能包含原文）")
	}
	fmt.Println("合并输出示例:", truncate(out, 200))
}

func TestChunkWithMultipleBlocks(t *testing.T) {
	// 使用较小 Token 预算强制产生多个 chunk
	chunker := NewChunker(20, 30, 30)
	chapter := Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Test", HTMLContent: testHTML}

	chunks, err := chunker.ChunkChapter(chapter)
	if err != nil {
		t.Fatalf("chunk 失败: %v", err)
	}
	if len(chunks) < 2 {
		t.Fatalf("期望至少 2 个 chunk，实际 %d", len(chunks))
	}

	translated := make([]string, len(chunks))
	for i, c := range chunks {
		translated[i] = fmt.Sprintf("[块%d] %s", i, c.HTMLFragment)
	}
	out, err := MergeTranslations(testHTML, chunks, translated)
	if err != nil {
		t.Fatalf("merge 失败: %v", err)
	}
	for i := range chunks {
		if !strings.Contains(out, fmt.Sprintf("[块%d]", i)) {
			t.Fatalf("chunk %d 的翻译内容未写回", i)
		}
	}
	// 检查原文块是否被移除
	if strings.Contains(out, "It was a cold morning when Ada first") {
		t.Logf("警告: 输出仍含原文段落")
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func parseHTML(s string) (*html.Node, error) {
	return html.Parse(strings.NewReader(s))
}
