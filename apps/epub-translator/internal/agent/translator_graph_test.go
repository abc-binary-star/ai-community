package agent

import (
	"context"
	"testing"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
)

func TestTranslatorGraphCompileAndRun(t *testing.T) {
	cfg := &config.LLMConfig{
		APIKey:      "", // 模拟模式
		Model:       "doubao-pro-128k",
		ReviewModel: "doubao-pro-32k",
	}
	provider := NewModelProvider(cfg)
	ctxMgr := NewContextManager()
	ctxMgr.SetGlossary(map[string]string{"AI": "AI（人工智能）"})

	g := NewTranslatorGraph(provider, ctxMgr)
	if g.runnable == nil {
		t.Fatal("Eino Graph 编译失败，runnable 为空")
	}

	out, err := g.TranslateChunk(context.Background(), TranslateChunkInput{
		Chunk: epub.TextChunk{
			Index:        0,
			ChapterID:    "c1",
			ChapterTitle: "Test",
			HTMLFragment: "<p>Ada opened her eyes.</p>",
			PlainText:    "Ada opened her eyes.",
			TokenCount:   8,
		},
		SourceLang: "en",
		TargetLang: "zh-CN",
	})
	if err != nil {
		t.Fatalf("TranslateChunk 失败: %v", err)
	}
	if !out.Success || out.TranslatedHTML == "" {
		t.Fatalf("翻译结果异常: %+v", out)
	}
	t.Logf("Graph 翻译成功: %s", truncate(out.TranslatedHTML, 80))

	// 验证上下文累积
	if got := ctxMgr.GetSummary("c1"); got == "" {
		t.Fatal("摘要未累积到上下文管理器")
	}
}
