package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/agent"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// PipelineService 流水线增强服务
// 覆盖拆解分析中的阶段 3（术语表）、阶段 6（一致性校验）、阶段 8（质量 QA）
type PipelineService struct {
	provider  *agent.ModelProvider
	parser    *epub.Parser
	chunker   *epub.Chunker
}

// NewPipelineService 创建流水线服务
func NewPipelineService(provider *agent.ModelProvider) *PipelineService {
	return &PipelineService{
		provider: provider,
		parser:   epub.NewParser(),
		chunker:  epub.NewChunker(1200, 300, 100),
	}
}

// ExtractGlossary 阶段 3：AI 从原文中抽取候选术语表
// 返回术语候选 JSON 字符串
func (s *PipelineService) ExtractGlossary(ctx context.Context, uploadPath, bookTitle string) (string, error) {
	logger.L().Infof("开始抽取术语: %s", bookTitle)

	book, err := s.parser.Parse(uploadPath)
	if err != nil {
		return "", fmt.Errorf("解析 EPUB 失败: %w", err)
	}

	samples := s.collectTextSamples(book, 12)
	if len(samples) == 0 {
		return "[]", nil
	}

	terms, err := s.provider.ExtractGlossary(ctx, samples)
	if err != nil {
		return "", fmt.Errorf("AI 抽取术语失败: %w", err)
	}

	data, err := json.Marshal(terms)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SaveGlossary 阶段 3：保存已确认的术语表
func (s *PipelineService) SaveGlossary(glossaryJSON string) (map[string]string, error) {
	terms := make([]agent.GlossaryTerm, 0)
	if err := json.Unmarshal([]byte(glossaryJSON), &terms); err != nil {
		return nil, fmt.Errorf("解析术语表失败: %w", err)
	}

	glossary := make(map[string]string)
	for _, t := range terms {
		if t.Source != "" && t.Target != "" {
			glossary[t.Source] = t.Target
		}
	}
	return glossary, nil
}

// CheckConsistency 阶段 6：全文一致性校验
func (s *PipelineService) CheckConsistency(ctx context.Context, uploadPath, outputPath, bookTitle, glossaryJSON string) (string, error) {
	logger.L().Infof("开始一致性校验: %s", bookTitle)

	srcBook, err := s.parser.Parse(uploadPath)
	if err != nil {
		return "", fmt.Errorf("解析源 EPUB 失败: %w", err)
	}
	tgtBook, err := s.parser.Parse(outputPath)
	if err != nil {
		return "", fmt.Errorf("解析译文 EPUB 失败: %w", err)
	}

	pairs := s.buildTextPairs(srcBook, tgtBook, 30)
	if len(pairs) == 0 {
		return "[]", nil
	}

	issues, err := s.provider.CheckConsistency(ctx, bookTitle, glossaryJSON, pairs)
	if err != nil {
		return "", fmt.Errorf("AI 一致性校验失败: %w", err)
	}
	data, err := json.Marshal(issues)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// AssessQuality 阶段 8：抽样 QA 评估
func (s *PipelineService) AssessQuality(ctx context.Context, uploadPath, outputPath, bookTitle, glossaryJSON string) (string, error) {
	logger.L().Infof("开始质量评估: %s", bookTitle)

	srcBook, err := s.parser.Parse(uploadPath)
	if err != nil {
		return "", fmt.Errorf("解析源 EPUB 失败: %w", err)
	}
	tgtBook, err := s.parser.Parse(outputPath)
	if err != nil {
		return "", fmt.Errorf("解析译文 EPUB 失败: %w", err)
	}

	pairs := s.buildTextPairs(srcBook, tgtBook, 20)
	if len(pairs) == 0 {
		return "", fmt.Errorf("未找到可评估的翻译样本")
	}

	report, err := s.provider.AssessQuality(ctx, pairs, glossaryJSON)
	if err != nil {
		return "", fmt.Errorf("AI 质量评估失败: %w", err)
	}
	data, err := json.Marshal(report)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// collectTextSamples 收集书中文本样本（每章若干纯文本块）
func (s *PipelineService) collectTextSamples(book *epub.Book, maxPerChapter int) []string {
	var samples []string
	for _, ch := range book.Chapters {
		chunks, err := s.chunker.ChunkChapter(ch)
		if err != nil {
			continue
		}
		count := 0
		for _, c := range chunks {
			if c.PlainText == "" {
				continue
			}
			samples = append(samples, c.PlainText)
			count++
			if count >= maxPerChapter {
				break
			}
		}
		if len(samples) >= 60 {
			break
		}
	}
	return samples
}

// buildTextPairs 按章节顺序构建 原文-译文 文本对
func (s *PipelineService) buildTextPairs(srcBook, tgtBook *epub.Book, maxPairs int) []agent.TextPair {
	srcByID := make(map[string]epub.Chapter)
	for _, ch := range srcBook.Chapters {
		srcByID[ch.ID] = ch
	}

	var pairs []agent.TextPair
	for _, tgtCh := range tgtBook.Chapters {
		srcCh, ok := srcByID[tgtCh.ID]
		if !ok {
			continue
		}
		srcChunks, err1 := s.chunker.ChunkChapter(srcCh)
		tgtChunks, err2 := s.chunker.ChunkChapter(tgtCh)
		if err1 != nil || err2 != nil {
			continue
		}
		n := len(srcChunks)
		if len(tgtChunks) < n {
			n = len(tgtChunks)
		}
		for i := 0; i < n; i++ {
			if srcChunks[i].PlainText == "" || tgtChunks[i].PlainText == "" {
				continue
			}
			pairs = append(pairs, agent.TextPair{
				Source: srcChunks[i].PlainText,
				Target: tgtChunks[i].PlainText,
			})
			if len(pairs) >= maxPairs {
				return pairs
			}
		}
	}
	return pairs
}

// ReadFile 判断文件是否存在
func (s *PipelineService) FileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
