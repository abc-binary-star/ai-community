package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/agent"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/model"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// TranslationService 翻译核心服务
type TranslationService struct {
	cfg          *config.Config
	parser       *epub.Parser
	writer       *epub.Writer
	chunker      *epub.Chunker
	modelProvider *agent.ModelProvider
}

// NewTranslationService 创建翻译服务
func NewTranslationService(cfg *config.Config) *TranslationService {
	return &TranslationService{
		cfg:           cfg,
		parser:        epub.NewParser(),
		writer:        epub.NewWriter(),
		chunker:       epub.NewChunker(cfg.Epub.ChunkMaxTokens, cfg.Epub.ContextLeftChars, cfg.Epub.ContextRightChars),
		modelProvider: agent.NewModelProvider(&cfg.LLM),
	}
}

// Provider 返回底层模型提供者（供流水线服务复用）
func (s *TranslationService) Provider() *agent.ModelProvider {
	return s.modelProvider
}

// TranslateRequest 创建翻译任务请求
type TranslateRequest struct {
	FilePath    string
	FileName    string
	SourceLang  string
	TargetLang  string
	Model       string
	Glossary    map[string]string
	// Progress 可选回调：翻译过程中上报 (done, total) 进度
	Progress func(done, total int)
}

// TranslateResult 翻译完成结果
type TranslateResult struct {
	TaskID     string
	OutputPath string
	BookTitle  string
	ChunkCount int
}

// Translate 执行完整翻译流程（同步，供异步 worker 调用）
func (s *TranslationService) Translate(ctx context.Context, req TranslateRequest) (*TranslateResult, error) {
	taskID := uuid.NewString()
	startTime := time.Now()

	logger.L().Infof("开始翻译任务 %s: 文件=%s", taskID, req.FileName)

	// 1. 解析 EPUB
	logger.L().Infof("[%s] 解析 EPUB...", taskID)
	book, err := s.parser.Parse(req.FilePath)
	if err != nil {
		return nil, fmt.Errorf("解析 EPUB 失败: %w", err)
	}
	logger.L().Infof("[%s] 解析完成: 书名=%s, 章节数=%d", taskID, book.Title, len(book.Chapters))

	// 2. 分块
	logger.L().Infof("[%s] 文本分块...", taskID)
	var allChunks []epub.TextChunk
	for _, chapter := range book.Chapters {
		chunks, err := s.chunker.ChunkChapter(chapter)
		if err != nil {
			logger.L().Warnf("[%s] 章节 %s 分块失败: %v", taskID, chapter.Title, err)
			continue
		}
		allChunks = append(allChunks, chunks...)
	}
	logger.L().Infof("[%s] 分块完成: 总块数=%d", taskID, len(allChunks))

	// 3. 初始化上下文管理器
	ctxMgr := agent.NewContextManager()
	if req.Glossary != nil {
		ctxMgr.SetGlossary(req.Glossary)
	}
	for _, ch := range book.Chapters {
		ctxMgr.RegisterChapter(ch.ID)
	}

	// 4. 翻译
	logger.L().Infof("[%s] 开始 Agent 翻译...", taskID)
	graph := agent.NewTranslatorGraph(s.modelProvider, ctxMgr)

	// 翻译开始：上报总块数
	if req.Progress != nil {
		req.Progress(0, len(allChunks))
	}

	results, err := graph.TranslateChunks(ctx, allChunks, req.SourceLang, req.TargetLang, req.Progress)
	if err != nil {
		return nil, fmt.Errorf("翻译过程出错: %w", err)
	}

	// 统计成功/失败
	successCount := 0
	for _, r := range results {
		if r.Success {
			successCount++
		}
	}
	logger.L().Infof("[%s] 翻译完成: 成功=%d, 失败=%d", taskID, successCount, len(results)-successCount)

	// 5. 组装翻译内容到章节
	translatedChapters := make(map[string]string)
	chunkIndexByChapter := make(map[string][]int)
	for i, chunk := range allChunks {
		chunkIndexByChapter[chunk.ChapterID] = append(chunkIndexByChapter[chunk.ChapterID], i)
	}

	for _, chapter := range book.Chapters {
		indices, ok := chunkIndexByChapter[chapter.ID]
		if !ok || len(indices) == 0 {
			translatedChapters[chapter.ID] = chapter.HTMLContent
			continue
		}

		// 收集该章节的 chunks 与对应翻译结果
		chapterChunks := make([]epub.TextChunk, 0, len(indices))
		translatedTexts := make([]string, 0, len(indices))
		for _, idx := range indices {
			chapterChunks = append(chapterChunks, allChunks[idx])
			if idx < len(results) && results[idx].Success {
				translatedTexts = append(translatedTexts, results[idx].TranslatedHTML)
			} else {
				translatedTexts = append(translatedTexts, allChunks[idx].HTMLFragment)
			}
		}

		merged, err := epub.MergeTranslations(chapter.HTMLContent, chapterChunks, translatedTexts)
		if err != nil {
			logger.L().Warnf("[%s] 章节 %s 合并翻译失败: %v，保留原文", taskID, chapter.Title, err)
			translatedChapters[chapter.ID] = chapter.HTMLContent
			continue
		}
		translatedChapters[chapter.ID] = merged
	}

	// 6. 生成输出 EPUB
	outputName := fmt.Sprintf("%s.zh-CN.epub", strings.TrimSuffix(req.FileName, filepath.Ext(req.FileName)))
	outputPath := filepath.Join(s.cfg.Storage.Local.OutputDir, taskID, outputName)
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return nil, fmt.Errorf("创建输出目录失败: %w", err)
	}

	// 备份原始文件供 Writer 使用
	origBackup := outputPath + ".orig"
	if err := copyFile(req.FilePath, origBackup); err != nil {
		logger.L().Warnf("备份原始文件失败: %v", err)
	}

	logger.L().Infof("[%s] 写回 EPUB...", taskID)
	err = s.writer.Write(&epub.WriteOptions{
		OutputPath:         outputPath,
		Book:               book,
		TranslatedChapters: translatedChapters,
		TranslatedTitle:    book.Title + "（简体中文版）",
	})
	if err != nil {
		return nil, fmt.Errorf("写回 EPUB 失败: %w", err)
	}

	// 清理临时备份
	os.Remove(origBackup)

	logger.L().Infof("[%s] 翻译任务完成，耗时: %s, 输出: %s",
		taskID, time.Since(startTime), outputPath)

	return &TranslateResult{
		TaskID:     taskID,
		OutputPath: outputPath,
		BookTitle:  book.Title,
		ChunkCount: len(allChunks),
	}, nil
}

// copyFile 复制文件
func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

// TaskService 任务管理服务（简化版，Phase 4 接入数据库）
type TaskService struct {
	tasks map[string]*model.Task
}

// NewTaskService 创建任务服务
func NewTaskService() *TaskService {
	return &TaskService{
		tasks: make(map[string]*model.Task),
	}
}

// CreateTask 创建任务
func (ts *TaskService) CreateTask(fileName, bookTitle, sourceLang, targetLang, modelName, uploadPath string) *model.Task {
	task := &model.Task{
		ID:         uuid.NewString(),
		FileName:   fileName,
		BookTitle:  bookTitle,
		SourceLang: sourceLang,
		TargetLang: targetLang,
		Model:      modelName,
		UploadPath: uploadPath,
		Status:     model.TaskStatusQueued,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	ts.tasks[task.ID] = task
	return task
}

// GetTask 获取任务
func (ts *TaskService) GetTask(id string) (*model.Task, bool) {
	task, ok := ts.tasks[id]
	return task, ok
}

// UpdateTaskStatus 更新任务状态
func (ts *TaskService) UpdateTaskStatus(id string, status model.TaskStatus) {
	if task, ok := ts.tasks[id]; ok {
		task.Status = status
		task.UpdatedAt = time.Now()
		if status == model.TaskStatusTranslating && task.StartedAt == nil {
			now := time.Now()
			task.StartedAt = &now
		}
		if status == model.TaskStatusCompleted || status == model.TaskStatusFailed {
			now := time.Now()
			task.CompletedAt = &now
		}
	}
}

// UpdateProgress 更新进度
func (ts *TaskService) UpdateProgress(id string, done, total int) {
	if task, ok := ts.tasks[id]; ok {
		task.DoneChunks = done
		task.TotalChunks = total
		task.UpdatedAt = time.Now()
	}
}

// ListTasks 列出所有任务
func (ts *TaskService) ListTasks() []*model.Task {
	tasks := make([]*model.Task, 0, len(ts.tasks))
	for _, t := range ts.tasks {
		tasks = append(tasks, t)
	}
	return tasks
}
