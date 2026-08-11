package router

import (
	"bytes"
	"context"
	"os"
	"path/filepath"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/handler"
)

// Register 注册路由
func Register(h *server.Hertz, hdl *handler.Handler) {
	// 全局 CORS 中间件（便于前后端分离调试）
	h.Use(func(ctx context.Context, c *app.RequestContext) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if string(c.Method()) == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next(ctx)
	})

	// 基础
	h.GET("/ping", hdl.Ping)
	h.GET("/api/v1/health", hdl.Health)

	// API v1 组
	v1 := h.Group("/api/v1")
	{
		// 翻译任务
		v1.POST("/translate", hdl.CreateTranslateTask)

		// 任务管理
		v1.GET("/tasks", hdl.ListTasks)
		v1.GET("/tasks/:id", hdl.GetTask)
		v1.GET("/tasks/:id/download", hdl.DownloadTask)

		// M1 书籍工作台：目录总览 / 前置页汉化 / 按章翻译 / 整本翻译 / 导出
		v1.GET("/tasks/:id/chapters", hdl.ListChapters)
		v1.GET("/tasks/:id/chapters/:index/content", hdl.GetChapterContent)
		v1.POST("/tasks/:id/frontmatter/translate", hdl.FrontMatterTranslate)
		v1.POST("/tasks/:id/chapters/:index/translate", hdl.TranslateChapter)
		v1.POST("/tasks/:id/translate", hdl.TranslateAllChapters)
		v1.POST("/tasks/:id/export", hdl.ExportBook)

		// 阶段 3：术语表（抽取 / 查看 / 确认）
		v1.POST("/tasks/:id/glossary/extract", hdl.ExtractGlossary)
		v1.GET("/tasks/:id/glossary", hdl.GetGlossary)
		v1.PUT("/tasks/:id/glossary", hdl.SaveGlossary)

		// 阶段 6：一致性校验
		v1.POST("/tasks/:id/consistency", hdl.CheckConsistency)

		// 阶段 8：质量 QA 与人工验收
		v1.POST("/tasks/:id/qa", hdl.AssessQuality)
		v1.POST("/tasks/:id/accept", hdl.AcceptTask)
	}

	// 前端静态资源（demo 单页）
	webRoot := resolveWebRoot()
	assetsRoot := filepath.Join(webRoot, "assets")
	h.StaticFS("/assets", &app.FS{
		Root: assetsRoot,
		PathRewrite: func(ctx *app.RequestContext) []byte {
			p := ctx.Path()
			return bytes.TrimPrefix(p, []byte("/assets"))
		},
	})
	h.GET("/", func(ctx context.Context, c *app.RequestContext) {
		c.File(filepath.Join(webRoot, "index.html"))
	})
}

// resolveWebRoot 计算 web 静态资源目录的绝对路径
func resolveWebRoot() string {
	if wd, err := os.Getwd(); err == nil {
		candidates := []string{
			filepath.Join(wd, "web"),
			filepath.Join(wd, "..", "web"),
		}
		for _, p := range candidates {
			if info, err := os.Stat(filepath.Join(p, "index.html")); err == nil && !info.IsDir() {
				return p
			}
		}
	}
	return "web"
}
