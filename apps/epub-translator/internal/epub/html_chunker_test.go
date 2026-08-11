package epub

import (
	"strings"
	"testing"
)

const sectionTestHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
<h1>The Awakening</h1>
<p>It was a cold morning when Ada first opened her eyes inside the machine.</p>
<p>"Hello there," said Ada.</p>
<p>"Good morning to you," she replied.</p>
<blockquote>A wise saying that should always be kept whole.</blockquote>
<p>Roses are red<br/>Violets are blue<br/>Ada is the chosen one.</p>
<p>Another normal paragraph for the aggregation test.</p>
</body>
</html>`

// TestCutSectionsSpecialBlocks 验证特殊块保护与节类型识别
func TestCutSectionsSpecialBlocks(t *testing.T) {
	chunker := NewSectionChunker(500)
	chapter := Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Test", HTMLContent: sectionTestHTML}

	sections, err := chunker.CutSections(chapter)
	if err != nil {
		t.Fatalf("CutSections 失败: %v", err)
	}
	if len(sections) < 5 {
		t.Fatalf("期望至少 5 个节，实际 %d", len(sections))
	}

	kinds := make([]string, 0, len(sections))
	for _, s := range sections {
		kinds = append(kinds, s.Kind)
	}
	t.Logf("节类型序列: %v", kinds)

	// 1. 普通段落聚合节（h1 + 首段）
	if kinds[0] != "heading" {
		t.Fatalf("首节类型应为 heading，实际 %s", kinds[0])
	}

	// 2. 连续对话聚合成一节（dialogue）
	if kinds[1] != "dialogue" {
		t.Fatalf("对话节类型应为 dialogue，实际 %s", kinds[1])
	}
	if !strings.Contains(sections[1].HTMLFragment, "Hello there") ||
		!strings.Contains(sections[1].HTMLFragment, "Good morning") {
		t.Fatalf("连续对话应聚合为同一节: %s", sections[1].HTMLFragment)
	}

	// 3. 引用块独立成节
	if kinds[2] != "quote" {
		t.Fatalf("引用节类型应为 quote，实际 %s", kinds[2])
	}
	if !strings.Contains(sections[2].HTMLFragment, "wise saying") {
		t.Fatalf("引用块内容缺失: %s", sections[2].HTMLFragment)
	}

	// 4. 诗歌独立成节
	if kinds[3] != "poem" {
		t.Fatalf("诗歌节类型应为 poem，实际 %s", kinds[3])
	}

	// 5. 末尾普通段落
	if kinds[4] != "paragraph" {
		t.Fatalf("末尾节类型应为 paragraph，实际 %s", kinds[4])
	}

	// 6. 块范围连续无重叠/无空洞
	for i, s := range sections {
		if s.BlockStart < 0 || s.BlockEnd < s.BlockStart {
			t.Fatalf("节 %d 块范围非法: [%d,%d]", i, s.BlockStart, s.BlockEnd)
		}
		if i > 0 && s.BlockStart != sections[i-1].BlockEnd+1 {
			t.Fatalf("节 %d 与前一节块范围不连续: [%d,%d] vs [%d,%d]",
				i, s.BlockStart, s.BlockEnd, sections[i-1].BlockStart, sections[i-1].BlockEnd)
		}
	}
}

// TestCutSectionsBudget 验证普通段落按目标字数聚合
func TestCutSectionsBudget(t *testing.T) {
	// 极小预算强制多节
	chunker := NewSectionChunker(30)
	chapter := Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Test", HTMLContent: sectionTestHTML}

	sections, err := chunker.CutSections(chapter)
	if err != nil {
		t.Fatalf("CutSections 失败: %v", err)
	}
	if len(sections) <= 5 {
		t.Fatalf("小预算下应产生更多节，实际 %d", len(sections))
	}

	// 特殊块保持完整：独立出现的引用/诗歌为单块节（不被预算拆散、不与普通段落混排）；
	// 连续对话允许聚合为同一节，但整段对话保持完整
	for _, s := range sections {
		if s.Kind == "quote" || s.Kind == "poem" {
			if s.BlockStart != s.BlockEnd {
				t.Fatalf("特殊块 %s 被拆散: [%d,%d]", s.Kind, s.BlockStart, s.BlockEnd)
			}
		}
	}
}

// TestCutSectionsDialogueDetection 验证对话识别（引号开头 / said 归属 / 中文引语）
func TestCutSectionsDialogueDetection(t *testing.T) {
	if !isDialogue(`"I'm coming," she said.`) {
		t.Fatal("引号开头未识别为对话")
	}
	if !isDialogue(`“我们走吧。”`) {
		t.Fatal("中文引号开头未识别为对话")
	}
	if !isDialogue(`He asked, "Where is the key?"`) {
		t.Fatal("含 said 归属未识别为对话")
	}
	if !isDialogue(`"明白了，"她说。`) {
		t.Fatal("中文引语归属未识别为对话")
	}
	if isDialogue(`The city was silent at dawn.`) {
		t.Fatal("普通陈述被误判为对话")
	}
	if !isPoem(`<p>line1<br/>line2<br/>line3</p>`) {
		t.Fatal("多行 <br> 未识别为诗歌")
	}
	if isPoem(`<p>a single line</p>`) {
		t.Fatal("单行被误判为诗歌")
	}
}

// TestCutSectionsIndexOrder 验证节序号连续
func TestCutSectionsIndexOrder(t *testing.T) {
	chunker := NewSectionChunker(0) // 默认 500 字
	chapter := Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Test", HTMLContent: sectionTestHTML}
	sections, err := chunker.CutSections(chapter)
	if err != nil {
		t.Fatalf("CutSections 失败: %v", err)
	}
	for i, s := range sections {
		if s.Index != i {
			t.Fatalf("节 %d 序号错误: %d", i, s.Index)
		}
		if s.ChapterID != chapter.ID || s.ChapterTitle != chapter.Title {
			t.Fatalf("节 %d 章节信息错误: %+v", i, s)
		}
	}
}

// TestCutSectionsRoundTrip 验证切分后内容可合并回原章节
func TestCutSectionsRoundTrip(t *testing.T) {
	chunker := NewSectionChunker(500)
	chapter := Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Test", HTMLContent: sectionTestHTML}
	sections, err := chunker.CutSections(chapter)
	if err != nil {
		t.Fatalf("CutSections 失败: %v", err)
	}

	chunks := make([]TextChunk, 0, len(sections))
	translated := make([]string, 0, len(sections))
	for _, s := range sections {
		chunks = append(chunks, TextChunk{
			Index:        s.Index,
			ChapterID:    s.ChapterID,
			ChapterTitle: s.ChapterTitle,
			HTMLFragment: s.HTMLFragment,
			PlainText:    s.PlainText,
			BlockStart:   s.BlockStart,
			BlockEnd:     s.BlockEnd,
		})
		translated = append(translated, "[译] "+s.HTMLFragment)
	}
	out, err := MergeTranslations(chapter.HTMLContent, chunks, translated)
	if err != nil {
		t.Fatalf("MergeTranslations 失败: %v", err)
	}
	for i := range sections {
		if !strings.Contains(out, "[译]") {
			t.Fatalf("节 %d 翻译未合并: %s", i, out)
		}
	}
	t.Logf("合并输出长度=%d", len(out))
}
