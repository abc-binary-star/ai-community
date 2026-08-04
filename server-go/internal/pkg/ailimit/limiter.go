// Package ailimit 提供统一的 AI 调用限制能力。
// 所有 AI 功能（LLM 对话、语音转文字等）的速率限制、每日配额、
// token 用量追踪和全局并发控制均通过本包实现。
//
// 设计原则：
//   - 滑动窗口限流在内存中完成，无需 Redis，适合单实例部署
//   - 每日配额持久化到 PostgreSQL，重启不丢失
//   - 全局并发信号量防止 LLM API 被打满
//   - token 用量逐条记录，便于成本分析与告警
package ailimit

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Feature 标识一个 AI 功能
type Feature string

const (
	FeatureSuggestTitle  Feature = "suggest_title"
	FeatureRewrite       Feature = "rewrite"
	FeatureSummarize     Feature = "summarize"
	FeatureVoicePolish   Feature = "voice_polish"
	FeatureSuggestTags   Feature = "suggest_tags"
	FeatureThreadSummary Feature = "thread_summary"
	FeaturePostSummary   Feature = "post_summary"
	FeatureTranscribe    Feature = "transcribe"
)

// FeatureConfig 单个 AI 功能的限制配置
type FeatureConfig struct {
	MaxPerMinute int // 每用户每分钟最大请求数
	MaxPerDay    int // 每用户每天最大请求数
}

// Config 全局限量配置
type Config struct {
	// GlobalMaxConcurrent 全局最大并发 AI 调用数（0 = 不限制）
	GlobalMaxConcurrent int
	// GlobalDailyTokenLimit 全局每日 token 上限（0 = 不限制）
	GlobalDailyTokenLimit int
	// FeatureConfigs 各功能的独立限制
	FeatureConfigs map[Feature]FeatureConfig
}

// DefaultConfig 返回合理的默认配置
func DefaultConfig() Config {
	return Config{
		GlobalMaxConcurrent:   5,
		GlobalDailyTokenLimit: 2_000_000,
		FeatureConfigs: map[Feature]FeatureConfig{
			FeatureSuggestTitle:  {MaxPerMinute: 10, MaxPerDay: 100},
			FeatureRewrite:       {MaxPerMinute: 5, MaxPerDay: 50},
			FeatureSummarize:     {MaxPerMinute: 10, MaxPerDay: 100},
			FeatureVoicePolish:   {MaxPerMinute: 5, MaxPerDay: 50},
			FeatureSuggestTags:   {MaxPerMinute: 10, MaxPerDay: 100},
			FeatureThreadSummary: {MaxPerMinute: 3, MaxPerDay: 20},
			FeaturePostSummary:   {MaxPerMinute: 3, MaxPerDay: 20},
			FeatureTranscribe:    {MaxPerMinute: 5, MaxPerDay: 30},
		},
	}
}

// CheckResult 限流检查结果
type CheckResult struct {
	Allowed    bool
	Reason     string // 被拒绝时的原因
	RetryAfter int    // 建议重试等待秒数
}

// LimitError 限流错误，可被 HTTP 中间件捕获以返回 429
type LimitError struct {
	Reason     string
	RetryAfter int
}

func (e *LimitError) Error() string { return e.Reason }

// CheckAsError 检查并返回 error（供 ai.PreCheckHook 使用）。
// 注意：此方法有副作用——会消费滑动窗口中的一个时间戳。
// 因此它在一次请求中只应被调用一次（由 ai.Chat 内部调用）。
func (l *Limiter) CheckAsError(ctx context.Context, userID string, feature Feature) error {
	r := l.Check(ctx, userID, feature)
	if !r.Allowed {
		return &LimitError{Reason: r.Reason, RetryAfter: r.RetryAfter}
	}
	return nil
}

// UsageRecord 单次 AI 调用的用量记录
type UsageRecord struct {
	UserID           string
	Feature          Feature
	Model            string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	DurationMs       int
	Success          bool
	ErrorMessage     string
}

// Limiter AI 调用限制器
type Limiter struct {
	db     *gorm.DB
	config Config

	// 内存滑动窗口：key = "userID:feature" -> 时间戳列表
	rateMu      sync.Mutex
	rateWindows map[string][]time.Time

	// 全局并发信号量
	concurrentSem chan struct{}
}

var globalLimiter *Limiter

// Init 初始化全局限制器（应用启动时调用一次）
func Init(db *gorm.DB, cfg Config) {
	l := &Limiter{
		db:          db,
		config:      cfg,
		rateWindows: make(map[string][]time.Time),
	}
	if cfg.GlobalMaxConcurrent > 0 {
		l.concurrentSem = make(chan struct{}, cfg.GlobalMaxConcurrent)
	}
	globalLimiter = l
	log.Printf("[AILimit] 初始化完成, 全局并发=%d, 全局日token上限=%d",
		cfg.GlobalMaxConcurrent, cfg.GlobalDailyTokenLimit)
}

// Get 返回全局限制器实例
func Get() *Limiter {
	return globalLimiter
}

// Check 检查用户是否可以发起指定功能的 AI 调用（纯检查，无副作用）。
// 可被多次调用：中间件层调一次做快速拒绝，ai.Chat 内部再调一次做兜底。
// 滑动窗口的时间戳消费在 RecordUsage 中完成。
func (l *Limiter) Check(ctx context.Context, userID string, feature Feature) CheckResult {
	fc, ok := l.config.FeatureConfigs[feature]
	if !ok {
		// 未配置的功能使用默认限制
		fc = FeatureConfig{MaxPerMinute: 5, MaxPerDay: 30}
	}

	// 1. 内存滑动窗口：每分钟频率检查（只读）
	key := userID + ":" + string(feature)
	now := time.Now()
	windowStart := now.Add(-time.Minute)

	l.rateMu.Lock()
	timestamps := l.rateWindows[key]
	count := 0
	for _, ts := range timestamps {
		if ts.After(windowStart) {
			count++
		}
	}
	if count >= fc.MaxPerMinute {
		l.rateMu.Unlock()
		// 找到最早的未过期时间戳计算重试时间
		var oldest time.Time
		for _, ts := range timestamps {
			if ts.After(windowStart) {
				if oldest.IsZero() || ts.Before(oldest) {
					oldest = ts
				}
			}
		}
		retryAfter := int(time.Until(oldest.Add(time.Minute)).Seconds()) + 1
		return CheckResult{
			Allowed:    false,
			Reason:     "请求过于频繁，请稍后再试",
			RetryAfter: retryAfter,
		}
	}
	l.rateMu.Unlock()

	// 2. DB 检查：每日配额
	today := now.Format("2006-01-02")
	var quota model.AIUserQuota
	result := l.db.WithContext(ctx).
		Where("user_id = ? AND date = ?", userID, today).
		First(&quota)
	if result.Error == nil && quota.RequestCount >= fc.MaxPerDay {
		return CheckResult{
			Allowed:    false,
			Reason:     "今日该功能的调用次数已达上限",
			RetryAfter: secondsUntilMidnight(now),
		}
	}

	// 3. DB 检查：全局每日 token 上限
	if l.config.GlobalDailyTokenLimit > 0 {
		var gq model.AIGlobalQuota
		if l.db.WithContext(ctx).Where("date = ?", today).First(&gq).Error == nil {
			if gq.TotalTokens >= l.config.GlobalDailyTokenLimit {
				return CheckResult{
					Allowed:    false,
					Reason:     "AI 服务今日用量已达上限，请明天再试",
					RetryAfter: secondsUntilMidnight(now),
				}
			}
		}
	}

	return CheckResult{Allowed: true}
}

// consumeRate 消费滑动窗口中的一个时间戳（在确认调用后执行）
func (l *Limiter) consumeRate(userID string, feature Feature) {
	key := userID + ":" + string(feature)
	now := time.Now()
	windowStart := now.Add(-time.Minute)

	l.rateMu.Lock()
	timestamps := l.rateWindows[key]
	pruned := timestamps[:0]
	for _, ts := range timestamps {
		if ts.After(windowStart) {
			pruned = append(pruned, ts)
		}
	}
	l.rateWindows[key] = append(pruned, now)
	l.rateMu.Unlock()
}

// AcquireConcurrent 获取全局并发槽位，返回释放函数。
// 若已达到并发上限则阻塞等待或返回错误。
func (l *Limiter) AcquireConcurrent(ctx context.Context) (func(), error) {
	if l.concurrentSem == nil {
		return func() {}, nil
	}
	select {
	case l.concurrentSem <- struct{}{}:
		return func() { <-l.concurrentSem }, nil
	case <-ctx.Done():
		return func() {}, ctx.Err()
	}
}

// RecordUsage 记录一次 AI 调用的实际用量并更新配额。
// 同时消费滑动窗口时间戳（仅成功调用才消费，失败不计数）。
func (l *Limiter) RecordUsage(ctx context.Context, rec UsageRecord) {
	// 消费滑动窗口时间戳（仅在调用实际发生时）
	l.consumeRate(rec.UserID, rec.Feature)

	today := time.Now().Format("2006-01-02")

	// 1. 写入审计日志
	logEntry := model.AIUsageLog{
		UserID:           rec.UserID,
		Feature:          string(rec.Feature),
		Model:            rec.Model,
		PromptTokens:     rec.PromptTokens,
		CompletionTokens: rec.CompletionTokens,
		TotalTokens:      rec.TotalTokens,
		DurationMs:       rec.DurationMs,
		Success:          rec.Success,
		ErrorMessage:     rec.ErrorMessage,
	}
	if err := l.db.WithContext(ctx).Create(&logEntry).Error; err != nil {
		log.Printf("[AILimit] 写入用量日志失败: %v", err)
	}

	// 2. 更新用户每日配额（upsert）
	userQuota := model.AIUserQuota{
		UserID:       rec.UserID,
		Date:         today,
		RequestCount: 1,
		TotalTokens:  rec.TotalTokens,
	}
	if err := l.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "date"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count": gorm.Expr("ai_user_quota.request_count + 1"),
			"total_tokens":  gorm.Expr("ai_user_quota.total_tokens + ?", rec.TotalTokens),
		}),
	}).Create(&userQuota).Error; err != nil {
		log.Printf("[AILimit] 更新用户配额失败: %v", err)
	}

	// 3. 更新全局每日配额（upsert）
	globalQuota := model.AIGlobalQuota{
		Date:         today,
		RequestCount: 1,
		TotalTokens:  rec.TotalTokens,
	}
	if err := l.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "date"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count": gorm.Expr("ai_global_quota.request_count + 1"),
			"total_tokens":  gorm.Expr("ai_global_quota.total_tokens + ?", rec.TotalTokens),
		}),
	}).Create(&globalQuota).Error; err != nil {
		log.Printf("[AILimit] 更新全局配额失败: %v", err)
	}

	// 4. 全局 token 上限告警
	if l.config.GlobalDailyTokenLimit > 0 {
		var gq model.AIGlobalQuota
		if l.db.WithContext(ctx).Where("date = ?", today).First(&gq).Error == nil {
			if gq.TotalTokens >= l.config.GlobalDailyTokenLimit {
				log.Printf("[AILimit] ⚠️ 全局每日 token 上限已达 (%d/%d)",
					gq.TotalTokens, l.config.GlobalDailyTokenLimit)
			} else if gq.TotalTokens >= l.config.GlobalDailyTokenLimit*80/100 {
				log.Printf("[AILimit] ⚠️ 全局每日 token 用量已达 80%% (%d/%d)",
					gq.TotalTokens, l.config.GlobalDailyTokenLimit)
			}
		}
	}
}

// secondsUntilMidnight 计算到午夜的秒数
func secondsUntilMidnight(now time.Time) int {
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
	return int(midnight.Sub(now).Seconds()) + 1
}
