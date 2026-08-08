package main

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ailimit"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/embedding"
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
	ailimitCfg.OverallDailyTokenLimit = cfg.AIDailyTokenLimit

	freePC := ailimitCfg.Plans[ailimit.PlanFree]
	freePC.DailyTokenLimit = cfg.AIFreeDailyTokenLimit
	freePC.GlobalTokenPool = cfg.AIFreeGlobalTokenPool
	freePC.RewriteMaxRunes = cfg.AIFreeRewriteMaxChars
	freePC.TranscribeMaxBytes = int64(cfg.AIFreeTranscribeMaxSecs) * 32000
	ailimitCfg.Plans[ailimit.PlanFree] = freePC

	proPC := ailimitCfg.Plans[ailimit.PlanPro]
	proPC.DailyTokenLimit = cfg.AIProDailyTokenLimit
	proPC.GlobalTokenPool = cfg.AIProGlobalTokenPool
	proPC.RewriteMaxRunes = cfg.AIProRewriteMaxChars
	ailimitCfg.Plans[ailimit.PlanPro] = proPC

	ailimit.Init(dal.DB, ailimitCfg)

	// 注入 AI 限制钩子（限制检查 + 用量记录 + 并发控制）
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

	// 分层并发控制：套餐级 + 全局
	ai.SetAcquireHook(func(ctx context.Context, userID string) (func(), error) {
		if limiter == nil {
			return func() {}, nil
		}
		return limiter.AcquireConcurrent(ctx, userID)
	})

	// UsageHook: 在 ai.Chat 完成后自动记录 token 用量
	ai.SetUsageHook(func(ctx context.Context, userID, feature, mdl string, usage ai.UsageInfo, durationMs int, err error) {
		if limiter == nil || userID == "" {
			return
		}
		// 默认完整计费；流式分片/降级子调用只计 token；系统任务只计全局池
		rec := ailimit.UsageRecord{
			UserID:           userID,
			Feature:          ailimit.Feature(feature),
			Model:            mdl,
			PromptTokens:     usage.PromptTokens,
			CompletionTokens: usage.CompletionTokens,
			TotalTokens:      usage.TotalTokens,
			DurationMs:       durationMs,
			Success:          err == nil,
			ErrorMessage:     "",
			CountQuota:       true,
			TrackUser:        true,
		}
		if err != nil {
			rec.ErrorMessage = err.Error()
		}
		switch ai.QuotaMode(ctx) {
		case "tokens_only":
			rec.CountQuota = false
		case "system":
			rec.CountQuota = false
			rec.TrackUser = false
		}
		limiter.RecordUsage(ctx, rec)
	})

	// 初始化语音转文字客户端（未配置 API Key 时语音功能降级）
	stt.Init(cfg.VolcASRKey, cfg.VolcASRResID)

	// 初始化向量化客户端与 pgvector 支持（想法语义邻居，可选增量）。
	// 未配置 EMBEDDING_API_KEY 或 pgvector 不可用时功能关闭，不影响想法基础能力。
	embedding.Init(cfg.EmbeddingKey, cfg.EmbeddingURL, cfg.EmbeddingModel, cfg.EmbeddingDim)
	if embedding.Enabled() {
		dal.InitVectorSupport(embedding.Dim())
	}

	// 初始化存储服务
	storage.Init(cfg)

	// 创建 Hertz 服务器（请求体限制 35MB，支持 30MB 以内图片上传，预留 multipart 表单开销）
	h := server.Default(
		server.WithHostPorts(":"+cfg.Port),
		server.WithMaxRequestBodySize(35<<20),
	)

	// 注册路由
	router.Register(h, cfg)

	// 启动服务
	log.Printf("🚀 Server running on http://localhost:%s", cfg.Port)
	log.Printf("   CORS allowed: %v", cfg.CORSOrigins)
	h.Spin()
}
