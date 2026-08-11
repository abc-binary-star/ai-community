package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
	"github.com/cloudwego/hertz/pkg/protocol/consts"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/model"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/service"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// Handler HTTP 请求处理器
type Handler struct {
	translationSvc *service.TranslationService
	taskSvc        *service.TaskService
	pipelineSvc    *service.PipelineService
	cfg            *config.Config
}

// NewHandler 创建处理器
func NewHandler(cfg *config.Config, translationSvc *service.TranslationService, taskSvc *service.TaskService, pipelineSvc *service.PipelineService) *Handler {
	return &Handler{
		translationSvc: translationSvc,
		taskSvc:        taskSvc,
		pipelineSvc:    pipelineSvc,
		cfg:            cfg,
	}
}

// CreateTranslateTask POST /api/v1/translate
func (h *Handler) CreateTranslateTask(ctx context.Context, c *app.RequestContext) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(consts.StatusBadRequest, utils.H{
			"error": "缺少上传文件，请使用 multipart/form-data 上传 epub 文件",
		})
		return
	}

	// 校验文件类型
	filename := file.Filename
	if !strings.HasSuffix(strings.ToLower(filename), ".epub") {
		c.JSON(consts.StatusBadRequest, utils.H{
			"error": "仅支持 .epub 格式文件",
		})
		return
	}

	// 获取参数
	sourceLang := string(c.FormValue("source_lang"))
	if sourceLang == "" {
		sourceLang = "auto"
	}
	targetLang := string(c.FormValue("target_lang"))
	if targetLang == "" {
		targetLang = "zh-CN"
	}
	usedModel := string(c.FormValue("model"))
	if usedModel == "" {
		usedModel = h.cfg.LLM.Model
	}

	// 创建任务（先生成 task，用真实 ID 作为上传文件名前缀）
	task := h.taskSvc.CreateTask(filename, "", sourceLang, targetLang, usedModel, "")
	uploadPath := filepath.Join(h.cfg.Storage.Local.UploadDir, task.ID+"_"+filename)
	task.UploadPath = uploadPath
	h.taskSvc.SaveTask(task)

	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		logger.L().Errorf("保存上传文件失败: %v", err)
		task.ErrorMessage = "保存上传文件失败"
		h.taskSvc.UpdateTaskStatus(task.ID, model.TaskStatusFailed)
		c.JSON(consts.StatusInternalServerError, utils.H{
			"error": "保存文件失败",
		})
		return
	}

	// 异步解析并初始化章节（M1：上传后先看目录，不自动整本翻译）
	safeGo(func() { h.executeInit(task.ID, uploadPath) })

	c.JSON(consts.StatusAccepted, utils.H{
		"task_id":    task.ID,
		"status":     task.Status,
		"file_name":  task.FileName,
		"created_at": task.CreatedAt,
		"message":    "书籍已上传，解析完成后可查看目录并按章翻译",
	})
}

// executeInit 异步解析 EPUB 并初始化章节状态
func (h *Handler) executeInit(taskID, filePath string) {
	h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusParsing)

	task, ok := h.taskSvc.GetTask(taskID)
	if !ok {
		return
	}
	book, err := h.translationSvc.ParseBook(task)
	if err != nil {
		logger.L().Errorf("任务 %s 解析失败: %v", taskID, err)
		task.ErrorMessage = "解析 EPUB 失败: " + err.Error()
		h.taskSvc.SaveTask(task)
		h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusFailed)
		return
	}

	task.BookTitle = book.Title
	task.Chapters = h.translationSvc.BuildChapterStates(book, nil)
	task.Status = model.TaskStatusReady
	h.taskSvc.SaveTask(task)
	logger.L().Infof("任务 %s 解析完成: 《%s》 %d 章，进入按章翻译", taskID, book.Title, len(book.Chapters))
}

// executeTranslation 异步执行翻译
func (h *Handler) executeTranslation(taskID, filePath, fileName, sourceLang, targetLang, usedModel string) {
	h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusParsing)

	// 注入已确认的术语表（阶段 3 产物）
	var glossary map[string]string
	if task, ok := h.taskSvc.GetTask(taskID); ok && task.GlossarySet && task.GlossaryJSON != "" {
		parsed, err := h.pipelineSvc.SaveGlossary(task.GlossaryJSON)
		if err == nil {
			glossary = parsed
		}
	}

	result, err := h.translationSvc.Translate(context.Background(), service.TranslateRequest{
		FilePath:   filePath,
		FileName:   fileName,
		SourceLang: sourceLang,
		TargetLang: targetLang,
		Model:      usedModel,
		Glossary:   glossary,
		Progress: func(done, total int) {
			h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusTranslating)
			h.taskSvc.UpdateProgress(taskID, done, total)
		},
	})
	if err != nil {
		logger.L().Errorf("翻译任务 %s 失败: %v", taskID, err)
		if task, ok := h.taskSvc.GetTask(taskID); ok {
			task.ErrorMessage = err.Error()
		}
		h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusFailed)
		return
	}

	if task, ok := h.taskSvc.GetTask(taskID); ok {
		task.OutputPath = result.OutputPath
		task.BookTitle = result.BookTitle
		task.TotalChunks = result.ChunkCount
		task.DoneChunks = result.ChunkCount
	}
	h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusCompleted)
}

// GetTask GET /api/v1/tasks/:id
func (h *Handler) GetTask(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("id")
	task, ok := h.taskSvc.GetTask(taskID)
	if !ok {
		c.JSON(consts.StatusNotFound, utils.H{
			"error": "任务不存在",
		})
		return
	}

	c.JSON(consts.StatusOK, utils.H{
		"task_id":           task.ID,
		"status":            task.Status,
		"file_name":         task.FileName,
		"book_title":        task.BookTitle,
		"source_lang":       task.SourceLang,
		"target_lang":       task.TargetLang,
		"model":             task.Model,
		"progress":          task.Progress(),
		"total_chunks":      task.TotalChunks,
		"translated_chunks": task.DoneChunks,
		"error":             task.ErrorMessage,
		"glossary":          task.GlossaryJSON,
		"glossary_draft":    task.GlossaryDraft,
		"glossary_set":      task.GlossarySet,
		"consistency":       task.Consistency,
		"qa_report":         task.QAReport,
		"accepted":          task.Accepted,
		"created_at":        task.CreatedAt,
		"updated_at":        task.UpdatedAt,
	})
}

// DownloadTask GET /api/v1/tasks/:id/download
func (h *Handler) DownloadTask(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("id")
	task, ok := h.taskSvc.GetTask(taskID)
	if !ok {
		c.JSON(consts.StatusNotFound, utils.H{
			"error": "任务不存在",
		})
		return
	}

	if task.Status != model.TaskStatusCompleted {
		c.JSON(consts.StatusBadRequest, utils.H{
			"error":  "任务尚未完成",
			"status": task.Status,
		})
		return
	}

	if task.OutputPath == "" {
		c.JSON(consts.StatusNotFound, utils.H{
			"error": "输出文件路径为空",
		})
		return
	}

	// 设置下载文件名并返回文件
	c.Response.Header.Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s.zh-CN.epub"`, task.FileName))
	c.File(task.OutputPath)
}

// ListTasks GET /api/v1/tasks
func (h *Handler) ListTasks(ctx context.Context, c *app.RequestContext) {
	tasks := h.taskSvc.ListTasks()
	var list []map[string]interface{}
	for _, t := range tasks {
		list = append(list, map[string]interface{}{
			"task_id":           t.ID,
			"status":            t.Status,
			"file_name":         t.FileName,
			"book_title":        t.BookTitle,
			"source_lang":       t.SourceLang,
			"target_lang":       t.TargetLang,
			"progress":          t.Progress(),
			"total_chunks":      t.TotalChunks,
			"translated_chunks": t.DoneChunks,
			"error":             t.ErrorMessage,
			"glossary_set":      t.GlossarySet,
			"accepted":          t.Accepted,
			"created_at":        t.CreatedAt,
		})
	}
	c.JSON(consts.StatusOK, utils.H{
		"tasks": list,
		"total": len(list),
	})
}

// Health GET /api/v1/health
func (h *Handler) Health(ctx context.Context, c *app.RequestContext) {
	c.JSON(consts.StatusOK, utils.H{
		"status":  "ok",
		"service": "epub-translator-agent",
		"version": "0.1.0",
	})
}

// Ping GET /ping
func (h *Handler) Ping(ctx context.Context, c *app.RequestContext) {
	c.JSON(consts.StatusOK, utils.H{"message": "pong"})
}

// safeGo 异步执行任务，panic 时记录日志而不拖垮服务
func safeGo(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logger.L().Errorf("异步任务 panic: %v", r)
			}
		}()
		fn()
	}()
}

// getTaskOr404 获取任务，不存在返回 404
func (h *Handler) getTaskOr404(c *app.RequestContext) (*model.Task, bool) {
	task, ok := h.taskSvc.GetTask(c.Param("id"))
	if !ok {
		c.JSON(consts.StatusNotFound, utils.H{"error": "任务不存在"})
		return nil, false
	}
	return task, true
}

// ExtractGlossary POST /api/v1/tasks/:id/glossary/extract
// 阶段 3：AI 抽取候选术语表（需任务已解析，允许翻译前调用）
func (h *Handler) ExtractGlossary(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	if task.UploadPath == "" {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "任务文件不存在"})
		return
	}

	bookTitle := task.BookTitle
	if bookTitle == "" {
		bookTitle = task.FileName
	}

	report, err := h.pipelineSvc.ExtractGlossary(ctx, task.UploadPath, bookTitle)
	if err != nil {
		logger.L().Errorf("术语抽取失败 task=%s: %v", task.ID, err)
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}

	task.GlossaryDraft = report
	task.UpdatedAt = time.Now()
	c.JSON(consts.StatusOK, utils.H{
		"task_id":       task.ID,
		"glossary_draft": report,
		"message":       "术语候选已生成，请确认后保存（PUT /api/v1/tasks/:id/glossary）",
	})
}

// GetGlossary GET /api/v1/tasks/:id/glossary
// 阶段 3：获取当前术语表与候选术语
func (h *Handler) GetGlossary(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	c.JSON(consts.StatusOK, utils.H{
		"task_id":        task.ID,
		"glossary":       task.GlossaryJSON,
		"glossary_draft": task.GlossaryDraft,
		"glossary_set":   task.GlossarySet,
	})
}

// SaveGlossary PUT /api/v1/tasks/:id/glossary
// 阶段 3：人工确认并保存术语表
func (h *Handler) SaveGlossary(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}

	body := c.Request.Body()
	if len(body) == 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "请求体不能为空"})
		return
	}

	var req struct {
		Glossary string `json:"glossary"` // 确认后的术语表 JSON（GlossaryTerm 数组）
	}
	if err := json.Unmarshal(body, &req); err != nil || req.Glossary == "" {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "glossary 字段必须是术语 JSON 数组字符串"})
		return
	}

	glossaryMap, err := h.pipelineSvc.SaveGlossary(req.Glossary)
	if err != nil {
		c.JSON(consts.StatusBadRequest, utils.H{"error": err.Error()})
		return
	}
	if len(glossaryMap) == 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "术语表为空"})
		return
	}

	task.GlossaryJSON = req.Glossary
	task.GlossarySet = true
	task.GlossaryDraft = ""
	task.UpdatedAt = time.Now()
	logger.L().Infof("任务 %s 术语表已确认: %d 条", task.ID, len(glossaryMap))

	c.JSON(consts.StatusOK, utils.H{
		"task_id":      task.ID,
		"glossary_set": true,
		"count":        len(glossaryMap),
		"message":      "术语表已保存，后续翻译将严格遵循",
	})
}

// CheckConsistency POST /api/v1/tasks/:id/consistency
// 阶段 6：全文一致性校验（需任务已完成）
func (h *Handler) CheckConsistency(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	if task.Status != model.TaskStatusCompleted || task.OutputPath == "" {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "任务尚未完成翻译", "status": task.Status})
		return
	}

	bookTitle := task.BookTitle
	if bookTitle == "" {
		bookTitle = task.FileName
	}

	report, err := h.pipelineSvc.CheckConsistency(ctx, task.UploadPath, task.OutputPath, bookTitle, task.GlossaryJSON)
	if err != nil {
		logger.L().Errorf("一致性校验失败 task=%s: %v", task.ID, err)
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}

	task.Consistency = report
	task.UpdatedAt = time.Now()
	c.JSON(consts.StatusOK, utils.H{
		"task_id":           task.ID,
		"consistency_report": report,
		"message":           "一致性校验完成",
	})
}

// AssessQuality POST /api/v1/tasks/:id/qa
// 阶段 8：抽样质量评估（需任务已完成）
func (h *Handler) AssessQuality(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	if task.Status != model.TaskStatusCompleted || task.OutputPath == "" {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "任务尚未完成翻译", "status": task.Status})
		return
	}

	bookTitle := task.BookTitle
	if bookTitle == "" {
		bookTitle = task.FileName
	}

	report, err := h.pipelineSvc.AssessQuality(ctx, task.UploadPath, task.OutputPath, bookTitle, task.GlossaryJSON)
	if err != nil {
		logger.L().Errorf("QA 评估失败 task=%s: %v", task.ID, err)
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}

	task.QAReport = report
	task.UpdatedAt = time.Now()
	c.JSON(consts.StatusOK, utils.H{
		"task_id":  task.ID,
		"qa_report": report,
		"message":  "质量评估完成",
	})
}

// AcceptTask POST /api/v1/tasks/:id/accept
// 阶段 8：QA 人工验收
func (h *Handler) AcceptTask(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	if task.Status != model.TaskStatusCompleted {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "任务尚未完成翻译", "status": task.Status})
		return
	}

	var req struct {
		Accepted bool `json:"accepted"`
	}
	body := c.Request.Body()
	if len(body) > 0 {
		_ = json.Unmarshal(body, &req)
	}
	task.Accepted = req.Accepted
	task.UpdatedAt = time.Now()

	if req.Accepted {
		logger.L().Infof("任务 %s 已通过人工验收", task.ID)
	} else {
		logger.L().Infof("任务 %s 标记为不通过", task.ID)
	}
	msg := "已标记不通过"
	if task.Accepted {
		msg = "已通过验收，可发布下载"
	}
	c.JSON(consts.StatusOK, utils.H{
		"task_id":  task.ID,
		"accepted": task.Accepted,
		"message":  msg,
	})
}

// ListChapters GET /api/v1/tasks/:id/chapters
// M1 书籍工作台：目录总览（章节列表 + 状态）
func (h *Handler) ListChapters(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}

	// 懒初始化章节状态（任务已存在但未解析时）
	if len(task.Chapters) == 0 {
		book, err := h.translationSvc.ParseBook(task)
		if err != nil {
			c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
			return
		}
		task.BookTitle = book.Title
		task.Chapters = h.translationSvc.BuildChapterStates(book, nil)
		h.taskSvc.SaveTask(task)
	}

	c.JSON(consts.StatusOK, utils.H{
		"task_id":           task.ID,
		"book_title":        task.BookTitle,
		"status":            task.Status,
		"chapters":          task.Chapters,
		"front_matter_done": task.FrontMatterDone,
		"glossary_set":      task.GlossarySet,
	})
}

// TranslateChapter POST /api/v1/tasks/:id/chapters/:index/translate
// M2 按章翻译（异步，段落节级，断点续跑）
func (h *Handler) TranslateChapter(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "章节序号无效"})
		return
	}

	// 标记任务翻译中、章节切分中
	h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
		t.Status = model.TaskStatusTranslating
		if index < len(t.Chapters) {
			t.Chapters[index].Status = model.ChapterStatusSplitting
		}
	})

	safeGo(func() {
		err := h.translationSvc.TranslateChapterBySections(context.Background(), task, index, nil)
		h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
			if err != nil {
				t.ErrorMessage = err.Error()
				logger.L().Errorf("章节 %d 翻译失败: %v", index, err)
			} else if index < len(task.Chapters) {
				t.Chapters[index] = task.Chapters[index]
			}
			t.Status = model.TaskStatusReady
		})
	})

	c.JSON(consts.StatusAccepted, utils.H{
		"task_id": task.ID,
		"index":   index,
		"message": "章节翻译已启动",
	})
}

// SplitChapter POST /api/v1/tasks/:id/chapters/:index/split
// M2 显式切分段落节（幂等：已切分则复用）
func (h *Handler) SplitChapter(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "章节序号无效"})
		return
	}

	count, err := h.translationSvc.SplitChapter(task, index)
	if err != nil {
		logger.L().Errorf("章节 %d 切分失败: %v", index, err)
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}
	h.taskSvc.SaveTask(task)

	c.JSON(consts.StatusOK, utils.H{
		"task_id":       task.ID,
		"index":         index,
		"section_count": count,
		"message":       "段落节切分完成",
	})
}

// ListChapterSections GET /api/v1/tasks/:id/chapters/:index/sections
// M2 段落节列表（未切分时自动切分）+ 节进度
func (h *Handler) ListChapterSections(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "章节序号无效"})
		return
	}

	sections, err := h.translationSvc.ListChapterSections(task, index)
	if err != nil {
		logger.L().Errorf("章节 %d 节列表失败: %v", index, err)
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}
	h.taskSvc.SaveTask(task)

	c.JSON(consts.StatusOK, utils.H{
		"task_id":       task.ID,
		"index":         index,
		"section_count": len(sections),
		"sections":      sections,
	})
}

// TranslateSection POST /api/v1/tasks/:id/chapters/:index/sections/:sid/translate
// M2 单节翻译 / 重译（异步）
func (h *Handler) TranslateSection(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "章节序号无效"})
		return
	}
	sid, err := strconv.Atoi(c.Param("sid"))
	if err != nil || sid < 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "节序号无效"})
		return
	}

	h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
		t.Status = model.TaskStatusTranslating
	})

	safeGo(func() {
		err := h.translationSvc.TranslateSection(context.Background(), task, index, sid)
		h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
			if err != nil {
				t.ErrorMessage = err.Error()
				logger.L().Errorf("章节 %d 节 %d 翻译失败: %v", index, sid, err)
			} else if index < len(task.Chapters) {
				t.Chapters[index] = task.Chapters[index]
			}
			t.Status = model.TaskStatusReady
		})
	})

	c.JSON(consts.StatusAccepted, utils.H{
		"task_id": task.ID,
		"index":   index,
		"section": sid,
		"message": "单节翻译已启动",
	})
}

// TranslateAllChapters POST /api/v1/tasks/:id/translate
// M1 整本逐章翻译（异步，基于段落节，断点续跑）
func (h *Handler) TranslateAllChapters(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}

	h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
		t.Status = model.TaskStatusTranslating
	})

	safeGo(func() {
		err := h.translationSvc.TranslateAllChapters(context.Background(), task)
		h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
			if err != nil {
				t.ErrorMessage = err.Error()
			}
			for i, cs := range task.Chapters {
				if i < len(t.Chapters) {
					t.Chapters[i] = cs
				}
			}
			t.Status = model.TaskStatusReady
		})
	})

	c.JSON(consts.StatusAccepted, utils.H{
		"task_id": task.ID,
		"message": "整本翻译已启动",
	})
}

// FrontMatterTranslate POST /api/v1/tasks/:id/frontmatter/translate
// M1 一键汉化前置页（封面/扉页/版权/目录）
func (h *Handler) FrontMatterTranslate(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}

	safeGo(func() {
		err := h.translationSvc.TranslateFrontMatter(context.Background(), task)
		h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
			if err != nil {
				t.ErrorMessage = err.Error()
				logger.L().Errorf("前置页汉化失败: %v", err)
			} else {
				t.FrontMatterDone = true
				for i, cs := range task.Chapters {
					if i < len(t.Chapters) && cs.Status == model.ChapterStatusTranslated {
						t.Chapters[i] = cs
					}
				}
			}
		})
	})

	c.JSON(consts.StatusAccepted, utils.H{
		"task_id": task.ID,
		"message": "前置页汉化已启动",
	})
}

// GetChapterContent GET /api/v1/tasks/:id/chapters/:index/content
// M1 章节预览：返回原文与译文（供阅读对照）
func (h *Handler) GetChapterContent(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "章节序号无效"})
		return
	}

	book, err := h.translationSvc.ParseBook(task)
	if err != nil {
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}
	if index >= len(book.Chapters) {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "章节序号越界"})
		return
	}

	sourceHTML := book.Chapters[index].HTMLContent
	translatedHTML := ""
	var chunkPairs []model.ChunkPair
	if index < len(task.Chapters) {
		translatedHTML = task.Chapters[index].TranslatedHTML
		chunkPairs = task.Chapters[index].ChunkPairs
	}

	c.JSON(consts.StatusOK, utils.H{
		"task_id":         task.ID,
		"index":           index,
		"title":           book.Chapters[index].Title,
		"kind":            book.Chapters[index].Kind,
		"source_html":     sourceHTML,
		"translated_html": translatedHTML,
		"chunk_pairs":     chunkPairs,
		"status":          func() string {
			if index < len(task.Chapters) {
				return string(task.Chapters[index].Status)
			}
			return string(model.ChapterStatusPending)
		}(),
	})
}

// ExportBook POST /api/v1/tasks/:id/export
// M1 组装已翻译章节并导出 EPUB
func (h *Handler) ExportBook(ctx context.Context, c *app.RequestContext) {
	task, ok := h.getTaskOr404(c)
	if !ok {
		return
	}
	if task.Chapters == nil {
		c.JSON(consts.StatusBadRequest, utils.H{"error": "任务尚未解析章节"})
		return
	}

	outputPath, err := h.translationSvc.BuildEpub(task)
	if err != nil {
		logger.L().Errorf("导出 EPUB 失败: %v", err)
		c.JSON(consts.StatusInternalServerError, utils.H{"error": err.Error()})
		return
	}

	h.taskSvc.MutateTask(task.ID, func(t *model.Task) {
		t.OutputPath = outputPath
		t.Status = model.TaskStatusCompleted
	})

	c.JSON(consts.StatusOK, utils.H{
		"task_id":     task.ID,
		"output_path": outputPath,
		"download":    "/api/v1/tasks/" + task.ID + "/download",
		"message":     "导出完成，可下载",
	})
}
