package agent

import (
	"context"
	"fmt"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// TranslatorGraph 翻译编排器
// Phase 2: 骨架实现，提供单块翻译流程
// Phase 3: 将升级为 Eino Graph 编排（Translate -> Review -> Rewrite 分支）
type TranslatorGraph struct {
	provider *ModelProvider
	ctxMgr   *ContextManager
}

// NewTranslatorGraph 创建翻译编排器
func NewTranslatorGraph(provider *ModelProvider, ctxMgr *ContextManager) *TranslatorGraph {
	return &TranslatorGraph{
		provider: provider,
		ctxMgr:   ctxMgr,
	}
}

// TranslateChunkInput 翻译单个 Chunk 的输入
type TranslateChunkInput struct {
	Chunk       epub.TextChunk
	SourceLang  string
	TargetLang  string
}

// TranslateChunkResult 翻译单个 Chunk 的结果
type TranslateChunkResult struct {
	ChunkIndex    int
	TranslatedHTML string
	Success       bool
	Error         error
}

// TranslateChunk 翻译单个文本块
// 当前为骨架流程：Translate -> Review -> Output
// Phase 3 将使用 Eino Graph 重构
func (g *TranslatorGraph) TranslateChunk(ctx context.Context, input TranslateChunkInput) (TranslateChunkResult, error) {
	chunk := input.Chunk
	result := TranslateChunkResult{ChunkIndex: chunk.Index}

	logger.L().Debugf("开始翻译 Chunk %d (章节: %s, tokens: %d)",
		chunk.Index, chunk.ChapterTitle, chunk.TokenCount)

	// 1. 构建翻译输入
	translateInput := TranslateInput{
		SourceText:   chunk.HTMLFragment,
		SourceLang:   input.SourceLang,
		TargetLang:   input.TargetLang,
		ContextLeft:  chunk.ContextLeft,
		ContextRight: chunk.ContextRight,
		Glossary:     g.ctxMgr.GetGlossaryJSON(),
		ChapterTitle: chunk.ChapterTitle,
		Summary:      g.ctxMgr.GetSummary(chunk.ChapterID),
	}

	// 2. 调用翻译
	output, err := g.provider.Translate(ctx, translateInput)
	if err != nil {
		result.Error = fmt.Errorf("翻译失败: %w", err)
		return result, result.Error
	}

	// 3. 质量审校
	passed, reviewMsg, err := g.provider.Review(ctx, chunk.HTMLFragment, output.TranslatedText, g.ctxMgr.GetGlossaryJSON())
	if err != nil {
		logger.L().Warnf("Chunk %d 审校出错: %v，采用翻译结果", chunk.Index, err)
	} else if !passed {
		logger.L().Warnf("Chunk %d 审校未通过: %s", chunk.Index, reviewMsg)
		// Phase 3: 这里会触发重译分支
	}

	// 4. 生成段落摘要并累积上下文
	summary, err := g.provider.GenerateSummary(ctx, chunk.PlainText)
	if err == nil && summary != "" {
		g.ctxMgr.AppendSummary(chunk.ChapterID, summary)
	}

	result.TranslatedHTML = output.TranslatedText
	result.Success = true

	logger.L().Debugf("Chunk %d 翻译完成，使用 tokens: %d", chunk.Index, output.UsedTokens)
	return result, nil
}

// TranslateChunks 批量翻译多个 Chunk（按顺序，保留上下文连贯）
// onProgress 可选：每完成一个 Chunk 回调 (done, total)
func (g *TranslatorGraph) TranslateChunks(ctx context.Context, chunks []epub.TextChunk, sourceLang, targetLang string, onProgress func(done, total int)) ([]TranslateChunkResult, error) {
	results := make([]TranslateChunkResult, len(chunks))
	total := len(chunks)
	done := 0

	for i, chunk := range chunks {
		select {
		case <-ctx.Done():
			return results, ctx.Err()
		default:
		}

		result, err := g.TranslateChunk(ctx, TranslateChunkInput{
			Chunk:      chunk,
			SourceLang: sourceLang,
			TargetLang: targetLang,
		})
		if err != nil {
			results[i] = TranslateChunkResult{
				ChunkIndex: chunk.Index,
				Success:    false,
				Error:      err,
			}
			logger.L().Errorf("Chunk %d 翻译失败: %v", chunk.Index, err)
		} else {
			results[i] = result
		}
		done++
		if onProgress != nil {
			onProgress(done, total)
		}
	}

	return results, nil
}
