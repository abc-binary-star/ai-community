package agent

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/compose"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// translateState 翻译图状态：贯穿 Translate → Review → (Rewrite) 各节点
type translateState struct {
	Input     TranslateInput
	Output    TranslateOutput
	Passed    bool
	ReviewMsg string
	Retries   int
}

// TranslatorGraph 翻译编排器
// 基于 Eino Graph：Translate -> Review -> 分支（合格结束 / 不合格重译循环）
type TranslatorGraph struct {
	provider   *ModelProvider
	ctxMgr     *ContextManager
	maxRetries int
	runnable   compose.Runnable[*translateState, *translateState]
}

// NewTranslatorGraph 创建翻译编排器
func NewTranslatorGraph(provider *ModelProvider, ctxMgr *ContextManager) *TranslatorGraph {
	g := &TranslatorGraph{
		provider:   provider,
		ctxMgr:     ctxMgr,
		maxRetries: 2,
	}
	g.buildGraph()
	return g
}

// buildGraph 构建并编译 Eino 翻译图
// 节点流：translate → review → 分支
//   - Passed 或重试耗尽 → 结束
//   - 否则 → rewrite（复用翻译节点）→ review，形成重译循环
func (g *TranslatorGraph) buildGraph() {
	graph := compose.NewGraph[*translateState, *translateState]()

	translateLambda := compose.InvokableLambda(g.translateNode)
	rewriteLambda := compose.InvokableLambda(g.translateNode)
	reviewLambda := compose.InvokableLambda(g.reviewNode)

	if err := graph.AddLambdaNode("translate", translateLambda); err != nil {
		logger.L().Warnf("添加 translate 节点失败: %v", err)
		return
	}
	if err := graph.AddLambdaNode("rewrite", rewriteLambda); err != nil {
		logger.L().Warnf("添加 rewrite 节点失败: %v", err)
		return
	}
	if err := graph.AddLambdaNode("review", reviewLambda); err != nil {
		logger.L().Warnf("添加 review 节点失败: %v", err)
		return
	}

	// 定义图边界：START → translate；review 通过分支到达 END
	if err := graph.AddEdge(compose.START, "translate"); err != nil {
		logger.L().Warnf("添加边 START->translate 失败: %v", err)
		return
	}
	if err := graph.AddEdge("translate", "review"); err != nil {
		logger.L().Warnf("添加边 translate->review 失败: %v", err)
		return
	}

	// 分支：审校未通过且未超过重试上限 → rewrite；否则结束
	// 注意：endNodes 是 condition 返回值白名单，必须包含所有可能的返回 key
	branch := compose.NewGraphBranch(func(ctx context.Context, in *translateState) (string, error) {
		if in.Passed || in.Retries >= g.maxRetries {
			return compose.END, nil
		}
		return "rewrite", nil
	}, map[string]bool{compose.END: true, "rewrite": true})
	if err := graph.AddBranch("review", branch); err != nil {
		logger.L().Warnf("添加审校分支失败: %v", err)
		return
	}
	if err := graph.AddEdge("rewrite", "review"); err != nil {
		logger.L().Warnf("添加边 rewrite->review 失败: %v", err)
		return
	}

	runnable, err := graph.Compile(context.Background())
	if err != nil {
		logger.L().Warnf("编译翻译 Graph 失败: %v，降级为直通模式", err)
		return
	}
	g.runnable = runnable
	logger.L().Debugf("翻译 Eino Graph 编译完成（最大重试 %d 次）", g.maxRetries)
}

// translateNode 翻译节点（translate 与 rewrite 共用）
func (g *TranslatorGraph) translateNode(ctx context.Context, state *translateState) (*translateState, error) {
	out, err := g.provider.Translate(ctx, state.Input)
	if err != nil {
		return nil, fmt.Errorf("翻译调用失败: %w", err)
	}
	state.Output = out
	state.Retries++
	return state, nil
}

// reviewNode 审校节点
func (g *TranslatorGraph) reviewNode(ctx context.Context, state *translateState) (*translateState, error) {
	passed, msg, err := g.provider.Review(ctx, state.Input.SourceText, state.Output.TranslatedText, g.ctxMgr.GetGlossaryJSON())
	if err != nil {
		logger.L().Warnf("审校调用出错: %v，默认通过", err)
		passed = true
	}
	state.Passed = passed
	state.ReviewMsg = msg
	if !passed {
		logger.L().Debugf("审校未通过（第 %d 次）: %s", state.Retries, msg)
	}
	return state, nil
}

// TranslateChunkInput 翻译单个 Chunk 的输入
type TranslateChunkInput struct {
	Chunk      epub.TextChunk
	SourceLang string
	TargetLang string
}

// TranslateChunkResult 翻译单个 Chunk 的结果
type TranslateChunkResult struct {
	ChunkIndex     int
	TranslatedHTML string
	Success        bool
	Error          error
}

// TranslateChunk 翻译单个文本块
func (g *TranslatorGraph) TranslateChunk(ctx context.Context, input TranslateChunkInput) (TranslateChunkResult, error) {
	chunk := input.Chunk
	result := TranslateChunkResult{ChunkIndex: chunk.Index}

	logger.L().Debugf("开始翻译 Chunk %d (章节: %s, tokens: %d)",
		chunk.Index, chunk.ChapterTitle, chunk.TokenCount)

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

	state := &translateState{Input: translateInput}

	if g.runnable != nil {
		invoked, err := g.runnable.Invoke(ctx, state)
		if err != nil {
			result.Error = fmt.Errorf("翻译失败: %w", err)
			return result, result.Error
		}
		state = invoked
		if state == nil {
			result.Error = fmt.Errorf("翻译图返回空状态")
			return result, result.Error
		}
		if !state.Passed {
			logger.L().Warnf("Chunk %d 审校未通过（重试耗尽）: %s", chunk.Index, state.ReviewMsg)
		}
	} else {
		// 直通模式（Graph 编译失败时降级）
		out, err := g.provider.Translate(ctx, translateInput)
		if err != nil {
			result.Error = fmt.Errorf("翻译失败: %w", err)
			return result, result.Error
		}
		state.Output = out
	}

	// 生成段落摘要并累积上下文
	summary, err := g.provider.GenerateSummary(ctx, chunk.PlainText)
	if err == nil && summary != "" {
		g.ctxMgr.AppendSummary(chunk.ChapterID, summary)
	}

	result.TranslatedHTML = state.Output.TranslatedText
	result.Success = true

	logger.L().Debugf("Chunk %d 翻译完成，使用 tokens: %d", chunk.Index, state.Output.UsedTokens)
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
