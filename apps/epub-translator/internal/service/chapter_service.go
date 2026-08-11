package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/agent"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/model"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// ParseBook 解析任务的 EPUB 原文
func (s *TranslationService) ParseBook(task *model.Task) (*epub.Book, error) {
	book, err := s.parser.Parse(task.UploadPath)
	if err != nil {
		return nil, fmt.Errorf("解析 EPUB 失败: %w", err)
	}
	return book, nil
}

// BuildChapterStates 构建章节状态列表（保留已有翻译进度）
func (s *TranslationService) BuildChapterStates(book *epub.Book, existing []model.ChapterState) []model.ChapterState {
	states := make([]model.ChapterState, 0, len(book.Chapters))
	for i, ch := range book.Chapters {
		st := model.ChapterState{
			Index:  i,
			ID:     ch.ID,
			Href:   ch.Href,
			Title:  ch.Title,
			Kind:   ch.Kind,
			Status: model.ChapterStatusPending,
		}
		if i < len(existing) {
			st.Status = existing[i].Status
			st.TranslatedHTML = existing[i].TranslatedHTML
			if existing[i].Title != "" {
				st.Title = existing[i].Title
			}
		}
		states = append(states, st)
	}
	return states
}

// parseGlossaryMap 将术语表 JSON（GlossaryTerm 数组）转为 map[原文]译名
func parseGlossaryMap(glossaryJSON string) map[string]string {
	if glossaryJSON == "" {
		return nil
	}
	var terms []agent.GlossaryTerm
	if err := json.Unmarshal([]byte(glossaryJSON), &terms); err != nil {
		logger.L().Warnf("解析术语表失败: %v", err)
		return nil
	}
	m := make(map[string]string)
	for _, t := range terms {
		if t.Source != "" && t.Target != "" {
			m[t.Source] = t.Target
		}
	}
	if len(m) == 0 {
		return nil
	}
	return m
}

// newContextForChapter 为翻译章节创建上下文管理器（注入已确认术语表）
func (s *TranslationService) newContextForChapter(task *model.Task, book *epub.Book) *agent.ContextManager {
	ctxMgr := agent.NewContextManager()
	if glossary := parseGlossaryMap(task.GlossaryJSON); glossary != nil {
		ctxMgr.SetGlossary(glossary)
	}
	for _, ch := range book.Chapters {
		ctxMgr.RegisterChapter(ch.ID)
	}
	return ctxMgr
}

// translateChapterContent 翻译单个章节内容，返回翻译后的 HTML 与块级对照
func (s *TranslationService) translateChapterContent(ctx context.Context, task *model.Task, book *epub.Book, index int) (string, []model.ChunkPair, error) {
	if index < 0 || index >= len(book.Chapters) {
		return "", nil, fmt.Errorf("章节序号越界: %d", index)
	}
	chapter := book.Chapters[index]

	chunks, err := s.chunker.ChunkChapter(chapter)
	if err != nil || len(chunks) == 0 {
		return "", nil, fmt.Errorf("章节 %s 分块失败: %v", chapter.Title, err)
	}

	ctxMgr := s.newContextForChapter(task, book)
	graph := agent.NewTranslatorGraph(s.modelProvider, ctxMgr)

	results, err := graph.TranslateChunks(ctx, chunks, task.SourceLang, task.TargetLang, nil)
	if err != nil {
		return "", nil, fmt.Errorf("章节 %s 翻译失败: %w", chapter.Title, err)
	}

	translatedTexts := make([]string, len(chunks))
	pairs := make([]model.ChunkPair, 0, len(chunks))
	success := 0
	for i, r := range results {
		if r.Success {
			translatedTexts[i] = r.TranslatedHTML
			success++
		} else {
			translatedTexts[i] = chunks[i].HTMLFragment
		}
		pairs = append(pairs, model.ChunkPair{
			SourceHTML:     chunks[i].HTMLFragment,
			TranslatedHTML: translatedTexts[i],
		})
	}
	if success == 0 {
		return "", nil, fmt.Errorf("章节 %s 全部翻译失败", chapter.Title)
	}

	merged, err := epub.MergeTranslations(chapter.HTMLContent, chunks, translatedTexts)
	if err != nil {
		return "", nil, fmt.Errorf("章节 %s 合并翻译失败: %w", chapter.Title, err)
	}
	logger.L().Infof("章节 %s 翻译完成（%d/%d 块成功）", chapter.Title, success, len(chunks))
	return merged, pairs, nil
}

// TranslateChapter 按章翻译：翻译并保存指定章节，更新任务状态
func (s *TranslationService) TranslateChapter(ctx context.Context, task *model.Task, index int) error {
	book, err := s.ParseBook(task)
	if err != nil {
		return err
	}
	if task.Chapters == nil {
		task.Chapters = s.BuildChapterStates(book, nil)
	}

	merged, pairs, err := s.translateChapterContent(ctx, task, book, index)
	if err != nil {
		return err
	}
	// 更新内存中的任务章节状态并持久化
	chapter := book.Chapters[index]
	task.Chapters[index].Status = model.ChapterStatusTranslated
	task.Chapters[index].TranslatedHTML = merged
	task.Chapters[index].ChunkPairs = pairs
	task.Chapters[index].Title = chapter.Title
	task.UpdatedAt = time.Now()
	return nil
}

// TranslateFrontMatter 一键汉化前置页（封面/扉页/版权/目录等）
// 仅翻译 Kind 非空的章节文本；封面图片不变；目录条目按章节标题译名统一
func (s *TranslationService) TranslateFrontMatter(ctx context.Context, task *model.Task) error {
	book, err := s.ParseBook(task)
	if err != nil {
		return err
	}
	if task.Chapters == nil {
		task.Chapters = s.BuildChapterStates(book, nil)
	}

	translated := 0
	for i, ch := range book.Chapters {
		// 只处理前置页（guide 中非 text 类型；"" 或 text 为正文不动）
		if ch.Kind == "" || ch.Kind == "text" {
			continue
		}
		logger.L().Infof("汉化前置页 [%d] %s (%s)", i, ch.Title, ch.Kind)
		merged, pairs, err := s.translateChapterContent(ctx, task, book, i)
		if err != nil {
			logger.L().Warnf("前置页 %s 汉化失败: %v（保留原文）", ch.Title, err)
			continue
		}
		task.Chapters[i].Status = model.ChapterStatusTranslated
		task.Chapters[i].TranslatedHTML = merged
		task.Chapters[i].ChunkPairs = pairs
		translated++
	}
	task.UpdatedAt = time.Now()
	logger.L().Infof("前置页汉化完成: %d 页", translated)
	return nil
}

// TranslateAllChapters 整本逐章翻译（按章顺序，失败章节保留原文并继续）
func (s *TranslationService) TranslateAllChapters(ctx context.Context, task *model.Task) error {
	book, err := s.ParseBook(task)
	if err != nil {
		return err
	}
	if task.Chapters == nil {
		task.Chapters = s.BuildChapterStates(book, nil)
	}

	failCount := 0
	for i := range book.Chapters {
		if task.Chapters[i].Status == model.ChapterStatusTranslated {
			continue // 已翻译的跳过
		}
		logger.L().Infof("整本翻译: 开始章节 [%d] %s", i, book.Chapters[i].Title)
		merged, pairs, err := s.translateChapterContent(ctx, task, book, i)
		if err != nil {
			logger.L().Warnf("章节 [%d] %s 翻译失败: %v", i, book.Chapters[i].Title, err)
			failCount++
			continue
		}
		task.Chapters[i].Status = model.ChapterStatusTranslated
		task.Chapters[i].TranslatedHTML = merged
		task.Chapters[i].ChunkPairs = pairs
	}
	task.UpdatedAt = time.Now()
	logger.L().Infof("整本翻译完成，失败章节: %d", failCount)
	return nil
}

// BuildEpub 将所有已翻译章节组装为输出 EPUB，返回输出路径
func (s *TranslationService) BuildEpub(task *model.Task) (string, error) {
	book, err := s.ParseBook(task)
	if err != nil {
		return "", err
	}

	translatedChapters := make(map[string]string)
	for _, cs := range task.Chapters {
		if cs.TranslatedHTML != "" {
			translatedChapters[cs.ID] = cs.TranslatedHTML
		}
	}

	outputName := fmt.Sprintf("%s.zh-CN.epub", strings.TrimSuffix(task.FileName, filepath.Ext(task.FileName)))
	outputPath := filepath.Join(s.cfg.Storage.Local.OutputDir, task.ID, outputName)
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return "", fmt.Errorf("创建输出目录失败: %w", err)
	}

	if err := copyFile(task.UploadPath, outputPath+".orig"); err != nil {
		logger.L().Warnf("备份原始文件失败: %v", err)
	}

	title := task.BookTitle
	if title == "" {
		title = book.Title
	}
	err = s.writer.Write(&epub.WriteOptions{
		OutputPath:         outputPath,
		Book:               book,
		TranslatedChapters: translatedChapters,
		TranslatedTitle:    title + "（简体中文版）",
	})
	if err != nil {
		return "", fmt.Errorf("写回 EPUB 失败: %w", err)
	}
	_ = os.Remove(outputPath + ".orig")

	logger.L().Infof("EPUB 组装完成: %s（%d 章已翻译）", outputPath, len(translatedChapters))
	return outputPath, nil
}
