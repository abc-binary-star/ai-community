package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/joho/godotenv"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/handler"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/router"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/service"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

func main() {
	// 解析命令行参数
	configPath := flag.String("config", "", "配置文件路径（默认 ./configs/config.yaml）")
	flag.Parse()

	// 加载 .env（提供 DEEPSEEK_API_KEY 等密钥，不纳入版本控制）
	_ = godotenv.Load()

	// 加载配置
	cfg, err := config.Load(*configPath)
	if err != nil {
		panic("加载配置失败: " + err.Error())
	}

	// 初始化日志
	log, err := logger.Init(&cfg.Log)
	if err != nil {
		panic("初始化日志失败: " + err.Error())
	}
	log.Infof("EPUB 翻译 Agent 启动中...")
	log.Infof("服务地址: %s, 模式: %s", cfg.Server.Addr(), cfg.Server.Mode)
	log.Infof("LLM 模型: %s (审校: %s)", cfg.LLM.Model, cfg.LLM.ReviewModel)
	log.Infof("存储目录: %s", cfg.Storage.Local.OutputDir)

	// 初始化服务层
	translationSvc := service.NewTranslationService(cfg)
	taskSvc, err := service.NewTaskService(cfg)
	if err != nil {
		panic("初始化任务存储失败: " + err.Error())
	}
	pipelineSvc := service.NewPipelineService(translationSvc.Provider())

	// 初始化 HTTP Handler
	hdl := handler.NewHandler(cfg, translationSvc, taskSvc, pipelineSvc)

	// 创建 Hertz 服务器
	h := server.Default(
		server.WithHostPorts(cfg.Server.Addr()),
		server.WithReadTimeout(cfg.Server.ReadTimeout),
		server.WithWriteTimeout(cfg.Server.WriteTimeout),
	)

	// 注册路由
	router.Register(h, hdl)

	// 优雅关闭
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		log.Info("收到退出信号，正在关闭服务...")
		h.Close()
	}()

	log.Infof("服务已启动: http://%s", cfg.Server.Addr())
	log.Info("API 端点:")
	log.Info("  POST   /api/v1/translate        - 创建翻译任务")
	log.Info("  GET    /api/v1/tasks             - 列出所有任务")
	log.Info("  GET    /api/v1/tasks/:id         - 查询任务状态")
	log.Info("  GET    /api/v1/tasks/:id/download - 下载翻译结果")
	log.Info("  GET    /api/v1/health            - 健康检查")

	h.Spin()
}
