package handler

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

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
	cfg            *config.Config
}

// NewHandler 创建处理器
func NewHandler(cfg *config.Config, translationSvc *service.TranslationService, taskSvc *service.TaskService) *Handler {
	return &Handler{
		translationSvc: translationSvc,
		taskSvc:        taskSvc,
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

	if err := c.SaveUploadedFile(file, uploadPath); err != nil {
		logger.L().Errorf("保存上传文件失败: %v", err)
		task.ErrorMessage = "保存上传文件失败"
		h.taskSvc.UpdateTaskStatus(task.ID, model.TaskStatusFailed)
		c.JSON(consts.StatusInternalServerError, utils.H{
			"error": "保存文件失败",
		})
		return
	}

	// 异步执行翻译
	go h.executeTranslation(task.ID, uploadPath, filename, sourceLang, targetLang, usedModel)

	c.JSON(consts.StatusAccepted, utils.H{
		"task_id":    task.ID,
		"status":     task.Status,
		"file_name":  task.FileName,
		"created_at": task.CreatedAt,
		"message":    "翻译任务已创建，请通过 GET /api/v1/tasks/:id 查询进度",
	})
}

// executeTranslation 异步执行翻译
func (h *Handler) executeTranslation(taskID, filePath, fileName, sourceLang, targetLang, usedModel string) {
	h.taskSvc.UpdateTaskStatus(taskID, model.TaskStatusParsing)

	result, err := h.translationSvc.Translate(context.Background(), service.TranslateRequest{
		FilePath:   filePath,
		FileName:   fileName,
		SourceLang: sourceLang,
		TargetLang: targetLang,
		Model:      usedModel,
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
