package main

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ailimit"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/jwt"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/storage"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/stt"
	"github.com/abc-binary-star/ai-community/server-go/internal/router"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/joho/godotenv"
)

func main() {
	// 加载 .env 文件（不存在时静默跳过，生产环境用系统环境变量）
	_ = godotenv.Load()

	// 加载配置
	cfg := conf.Load()

	// 初始化数据库
	dal.Init(cfg)

	// 初始化 JWT
	jwt.Init(cfg.JWTSecret)

	// 初始化 AI 网关（未配置 API Key 时 AI 功能降级，不影响社区基础功能）
	ai.Init(cfg.DeepSeekKey, cfg.DeepSeekURL, cfg.DeepSeekModel)

	// 初始化 AI 限制器（速率限制 + 每日配额 + token 追踪）
	ailimitCfg := ailimit.DefaultConfig()
	ailimitCfg.GlobalMaxConcurrent = cfg.AIConcurrentLimit
	ailimitCfg.GlobalDailyTokenLimit = cfg.AIDailyTokenLimit
	ailimit.Init(dal.DB, ailimitCfg)

	// 注入 AI 限制钩子（限制检查 + 用量记录）
	ai.SetMaxConcurrent(cfg.AIConcurrentLimit)
	limiter := ailimit.Get()

	// PreCheckHook: 在 ai.Chat 内部自动执行限制检查
	// 任何调用 ai.Chat 的代码都会自动受限，无需手动接入
	ai.SetPreCheckHook(func(ctx context.Context, userID, feature string) error {
		if limiter == nil {
			return nil
		}
		return limiter.CheckAsError(ctx, userID, ailimit.Feature(feature))
	})

	// UsageHook: 在 ai.Chat 完成后自动记录 token 用量
	ai.SetUsageHook(func(ctx context.Context, userID, feature, mdl string, usage ai.UsageInfo, durationMs int, err error) {
		if limiter == nil || userID == "" {
			return
		}
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		limiter.RecordUsage(ctx, ailimit.UsageRecord{
			UserID:           userID,
			Feature:          ailimit.Feature(feature),
			Model:            mdl,
			PromptTokens:     usage.PromptTokens,
			CompletionTokens: usage.CompletionTokens,
			TotalTokens:      usage.TotalTokens,
			DurationMs:       durationMs,
			Success:          err == nil,
			ErrorMessage:     errMsg,
		})
	})

	// 初始化语音转文字客户端（未配置 API Key 时语音功能降级）
	stt.Init(cfg.VolcASRKey, cfg.VolcASRResID)

	// 初始化存储服务
	storage.Init(cfg)

	// 创建 Hertz 服务器
	h := server.Default(server.WithHostPorts(":" + cfg.Port))

	// 注册路由
	router.Register(h, cfg)

	// 启动服务
	log.Printf("🚀 Server running on http://localhost:%s", cfg.Port)
	log.Printf("   CORS allowed: %v", cfg.CORSOrigins)
	h.Spin()
}
