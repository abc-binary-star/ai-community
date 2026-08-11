// Package ailimit 提供统一的 AI 调用限制能力。
// 所有 AI 功能（LLM 对话、语音转文字等）的速率限制、每日配额、
// token 用量追踪和全局并发控制均通过本包实现。
//
// 设计原则：
//   - 滑动窗口限流在内存中完成，无需 Redis，适合单实例部署
//   - 每日配额持久化到 PostgreSQL，重启不丢失
//   - 免费 / 订阅（Pro）用户使用不同的配额配置与全局 token 分池
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
	FeatureTranscribe    Feature = "transcribe"
	// FeatureEnrich 标题、摘要、标签三产物合并生成
	FeatureEnrich Feature = "enrich"
	// FeatureAssetRun 资产试玩：在帖子详情页/资产详情页运行 Prompt 资产（B3）
	FeatureAssetRun Feature = "asset_run"
)

// 套餐标识
const (
	PlanFree  = "free"
	PlanPro   = "pro"
	PlanAdmin = "admin"
)

// FeatureConfig 单个 AI 功能的限制配置
type FeatureConfig struct {
	MaxPerMinute int // 每用户每分钟最大请求数
	MaxPerDay    int // 每用户每天最大请求数（按功能独立计数）
}

// PlanConfig 单个套餐的 AI 限制配置
type PlanConfig struct {
	DailyTokenLimit    int                       // 每用户每日 token 上限（0 = 不限制）
	GlobalTokenPool    int                       // 该套餐全局每日 token 分池（0 = 不限制）
	MaxConcurrent      int                       // 该套餐最大并发（0 = 不限制）
	RewriteMaxRunes    int                       // 润色单次最大字数
	TranscribeMaxBytes int64                     // 语音转文字单次最大音频字节数
	FeatureConfigs     map[Feature]FeatureConfig // 功能级配额
}

// Config 全局限量配置
type Config struct {
	// GlobalMaxConcurrent 全局最大并发 AI 调用数（0 = 不限制）
	GlobalMaxConcurrent int
	// OverallDailyTokenLimit 全部套餐合计每日 token 上限（0 = 不限制）
	OverallDailyTokenLimit int
	// Plans 按套餐的配置
	Plans map[string]PlanConfig
}

// DefaultConfig 返回合理的默认配置。
// 免费档比最初建议稿更宽松：轻量功能 20 次/日，润色 10 次/日，语音 5 次/日。
func DefaultConfig() Config {
	return Config{
		GlobalMaxConcurrent:    5,
		OverallDailyTokenLimit: 2_000_000,
		Plans: map[string]PlanConfig{
			PlanFree: {
				DailyTokenLimit:    100_000,
				GlobalTokenPool:    700_000,
				MaxConcurrent:      2,
				RewriteMaxRunes:    8000,
				TranscribeMaxBytes: 180 * 32000, // PCM 16kHz 16bit mono，约 3 分钟
				FeatureConfigs: map[Feature]FeatureConfig{
					FeatureSuggestTitle:  {MaxPerMinute: 5, MaxPerDay: 20},
					FeatureRewrite:       {MaxPerMinute: 5, MaxPerDay: 10},
					FeatureSummarize:     {MaxPerMinute: 5, MaxPerDay: 20},
					FeatureVoicePolish:   {MaxPerMinute: 5, MaxPerDay: 15},
					FeatureSuggestTags:   {MaxPerMinute: 5, MaxPerDay: 20},
					FeatureThreadSummary: {MaxPerMinute: 2, MaxPerDay: 5},
					FeatureTranscribe:    {MaxPerMinute: 2, MaxPerDay: 5},
					FeatureEnrich:        {MaxPerMinute: 5, MaxPerDay: 10},
					FeatureAssetRun:      {MaxPerMinute: 5, MaxPerDay: 20},
				},
			},
			PlanPro: {
				DailyTokenLimit:    500_000,
				GlobalTokenPool:    1_300_000,
				MaxConcurrent:      4,
				RewriteMaxRunes:    40000,
				TranscribeMaxBytes: 25 << 20, // 25MB，约 13 分钟
				FeatureConfigs: map[Feature]FeatureConfig{
					FeatureSuggestTitle:  {MaxPerMinute: 10, MaxPerDay: 100},
					FeatureRewrite:       {MaxPerMinute: 10, MaxPerDay: 100},
					FeatureSummarize:     {MaxPerMinute: 10, MaxPerDay: 100},
					FeatureVoicePolish:   {MaxPerMinute: 10, MaxPerDay: 50},
					FeatureSuggestTags:   {MaxPerMinute: 10, MaxPerDay: 100},
					FeatureThreadSummary: {MaxPerMinute: 5, MaxPerDay: 30},
					FeatureTranscribe:    {MaxPerMinute: 5, MaxPerDay: 30},
					FeatureEnrich:        {MaxPerMinute: 10, MaxPerDay: 100},
					FeatureAssetRun:      {MaxPerMinute: 10, MaxPerDay: 50},
				},
			},
			PlanAdmin: {
				DailyTokenLimit:    0,
				GlobalTokenPool:    0,
				MaxConcurrent:      0,
				RewriteMaxRunes:    40000,
				TranscribeMaxBytes: 25 << 20,
				FeatureConfigs:     map[Feature]FeatureConfig{},
			},
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
// 与 Check 一样是纯读、无副作用的，可安全重复调用。
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
	// CountQuota 是否计入请求次数。流式润色分片、系统任务传 false，
	// 由外层在请求开始时统一计 1 次。
	CountQuota bool
	// TrackUser 是否计入用户级配额。系统后台任务传 false（只计全局分池）。
	TrackUser bool
}

// FeatureUsage 单个功能的今日用量
type FeatureUsage struct {
	Feature        Feature `json:"feature"`
	UsedToday      int     `json:"usedToday"`
	LimitPerDay    int     `json:"limitPerDay"`
	LimitPerMinute int     `json:"limitPerMinute"`
}

// UsageSummary 用户 AI 用量概览
type UsageSummary struct {
	Plan            string         `json:"plan"`
	PlanExpiresAt   *time.Time     `json:"planExpiresAt"`
	Unlimited       bool           `json:"unlimited"`
	DailyTokenLimit int            `json:"dailyTokenLimit"`
	TokensUsedToday int            `json:"tokensUsedToday"`
	PoolTokenLimit  int            `json:"poolTokenLimit"`
	PoolTokensUsed  int            `json:"poolTokensUsed"`
	Features        []FeatureUsage `json:"features"`
}

// userSnapshot 限流所需的用户信息
type userSnapshot struct {
	UserID        string
	Role          string
	Plan          string
	PlanExpiresAt *time.Time
}

// Limiter AI 调用限制器
type Limiter struct {
	db     *gorm.DB
	config Config

	// 内存滑动窗口：key = "userID:feature" -> 时间戳列表
	rateMu      sync.Mutex
	rateWindows map[string][]time.Time

	// 套餐级并发信号量 + 全局并发信号量（先取套餐、再取全局）
	planSems  map[string]chan struct{}
	globalSem chan struct{}
}

var globalLimiter *Limiter

// Init 初始化全局限制器（应用启动时调用一次）
func Init(db *gorm.DB, cfg Config) {
	l := &Limiter{
		db:          db,
		config:      cfg,
		rateWindows: make(map[string][]time.Time),
		planSems:    make(map[string]chan struct{}),
	}
	for plan, pc := range cfg.Plans {
		if pc.MaxConcurrent > 0 {
			l.planSems[plan] = make(chan struct{}, pc.MaxConcurrent)
		}
	}
	if cfg.GlobalMaxConcurrent > 0 {
		l.globalSem = make(chan struct{}, cfg.GlobalMaxConcurrent)
	}
	globalLimiter = l
	log.Printf("[AILimit] 初始化完成, 全局并发=%d, 全局日token上限=%d, 套餐数=%d",
		cfg.GlobalMaxConcurrent, cfg.OverallDailyTokenLimit, len(cfg.Plans))
}

// Get 返回全局限制器实例
func Get() *Limiter {
	return globalLimiter
}

func (l *Limiter) loadUser(ctx context.Context, userID string) userSnapshot {
	snap := userSnapshot{UserID: userID, Plan: PlanFree}
	var u model.User
	if err := l.db.WithContext(ctx).
		Select("role", "plan", "plan_expires_at").
		First(&u, "id = ?", userID).Error; err == nil {
		snap.Role = u.Role
		snap.Plan = u.Plan
		snap.PlanExpiresAt = u.PlanExpiresAt
	}
	return snap
}

// effectivePlan 返回用户实际生效的套餐（订阅到期自动降为免费）
func effectivePlan(u userSnapshot) string {
	if u.Plan == PlanPro && (u.PlanExpiresAt == nil || time.Now().Before(*u.PlanExpiresAt)) {
		return PlanPro
	}
	return PlanFree
}

// recordPlan 返回用量记录应归属的套餐池
func recordPlan(u userSnapshot) string {
	if u.Role == "admin" {
		return PlanAdmin
	}
	return effectivePlan(u)
}

func (l *Limiter) planConfig(plan string) PlanConfig {
	if pc, ok := l.config.Plans[plan]; ok {
		return pc
	}
	if pc, ok := l.config.Plans[PlanFree]; ok {
		return pc
	}
	return PlanConfig{FeatureConfigs: map[Feature]FeatureConfig{}}
}

func featureConfig(pc PlanConfig, feature Feature) FeatureConfig {
	if fc, ok := pc.FeatureConfigs[feature]; ok {
		return fc
	}
	// 未配置的功能使用默认限制
	return FeatureConfig{MaxPerMinute: 5, MaxPerDay: 30}
}

// Check 检查用户是否可以发起指定功能的 AI 调用（纯检查，无副作用）。
// 管理员账号不受限制。
func (l *Limiter) Check(ctx context.Context, userID string, feature Feature) CheckResult {
	u := l.loadUser(ctx, userID)
	if u.Role == "admin" {
		return CheckResult{Allowed: true}
	}

	plan := effectivePlan(u)
	pc := l.planConfig(plan)
	fc := featureConfig(pc, feature)

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
		var oldest time.Time
		for _, ts := range timestamps {
			if ts.After(windowStart) && (oldest.IsZero() || ts.Before(oldest)) {
				oldest = ts
			}
		}
		l.rateMu.Unlock()
		retryAfter := int(time.Until(oldest.Add(time.Minute)).Seconds()) + 1
		return CheckResult{
			Allowed:    false,
			Reason:     "请求过于频繁，请稍后再试",
			RetryAfter: retryAfter,
		}
	}
	l.rateMu.Unlock()

	today := now.Format("2006-01-02")

	// 2. DB 检查：该功能今日次数
	var quota model.AIUserQuota
	qErr := l.db.WithContext(ctx).
		Where("user_id = ? AND date = ? AND feature = ?", userID, today, string(feature)).
		First(&quota).Error
	if qErr == nil && quota.RequestCount >= fc.MaxPerDay {
		return CheckResult{
			Allowed:    false,
			Reason:     "今日该功能的调用次数已达上限",
			RetryAfter: secondsUntilMidnight(now),
		}
	}

	// 3. DB 检查：用户每日 token 预算
	if pc.DailyTokenLimit > 0 {
		var tokenQuota model.AIUserQuota
		if l.db.WithContext(ctx).
			Where("user_id = ? AND date = ? AND feature = 'total'", userID, today).
			First(&tokenQuota).Error == nil && tokenQuota.TotalTokens >= pc.DailyTokenLimit {
			return CheckResult{
				Allowed:    false,
				Reason:     "今日 AI token 预算已用完，明天再来或升级订阅",
				RetryAfter: secondsUntilMidnight(now),
			}
		}
	}

	// 4. DB 检查：套餐全局每日 token 分池
	if pc.GlobalTokenPool > 0 {
		var gq model.AIGlobalQuota
		if l.db.WithContext(ctx).Where("date = ? AND plan = ?", today, plan).First(&gq).Error == nil {
			if gq.TotalTokens >= pc.GlobalTokenPool {
				return CheckResult{
					Allowed:    false,
					Reason:     planReachPoolReason(plan),
					RetryAfter: secondsUntilMidnight(now),
				}
			}
		}
	}

	// 5. DB 检查：全套餐合计每日 token 上限（安全网）
	if l.config.OverallDailyTokenLimit > 0 {
		var sum struct{ Total int64 }
		l.db.WithContext(ctx).
			Model(&model.AIGlobalQuota{}).
			Where("date = ?", today).
			Select("COALESCE(SUM(total_tokens), 0) AS total").
			Scan(&sum)
		if sum.Total >= int64(l.config.OverallDailyTokenLimit) {
			return CheckResult{
				Allowed:    false,
				Reason:     "AI 服务今日用量已达上限，请明天再试",
				RetryAfter: secondsUntilMidnight(now),
			}
		}
	}

	return CheckResult{Allowed: true}
}

func planReachPoolReason(plan string) string {
	if plan == PlanPro {
		return "订阅用户今日 AI 用量已达上限，请明天再试"
	}
	return "免费用户今日 AI 用量已达上限，可升级订阅获得更多额度"
}

// ReserveRequest 为一次「多分片请求」（如流式润色）预留配额：
// 检查 + 消费 1 次频率 + 增加 1 次请求计数。
// 后续分片只记录 token，不再重复计次。
func (l *Limiter) ReserveRequest(ctx context.Context, userID string, feature Feature) error {
	r := l.Check(ctx, userID, feature)
	if !r.Allowed {
		return &LimitError{Reason: r.Reason, RetryAfter: r.RetryAfter}
	}

	l.consumeRate(userID, feature)
	today := time.Now().Format("2006-01-02")
	u := l.loadUser(ctx, userID)
	plan := recordPlan(u)

	l.upsertUserQuota(ctx, model.AIUserQuota{
		UserID:       userID,
		Date:         today,
		Feature:      string(feature),
		RequestCount: 1,
	})
	l.upsertGlobalQuota(ctx, model.AIGlobalQuota{
		Plan:         plan,
		Date:         today,
		RequestCount: 1,
	})
	return nil
}

// consumeRate 消费滑动窗口中的一个时间戳（任何实际调用尝试都会消费，防刷）
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

// AcquireConcurrent 获取并发槽位：先取套餐级、再取全局，返回释放函数。
// 管理员不受并发限制。
func (l *Limiter) AcquireConcurrent(ctx context.Context, userID string) (func(), error) {
	u := l.loadUser(ctx, userID)
	if u.Role == "admin" {
		return func() {}, nil
	}

	plan := effectivePlan(u)
	releases := make([]func(), 0, 2)
	releaseAll := func() {
		for i := len(releases) - 1; i >= 0; i-- {
			releases[i]()
		}
	}

	if sem := l.planSems[plan]; sem != nil {
		select {
		case sem <- struct{}{}:
			releases = append(releases, func() { <-sem })
		case <-ctx.Done():
			return func() {}, ctx.Err()
		}
	}
	if l.globalSem != nil {
		select {
		case l.globalSem <- struct{}{}:
			releases = append(releases, func() { <-l.globalSem })
		case <-ctx.Done():
			releaseAll()
			return func() {}, ctx.Err()
		}
	}

	return func() {
		for i := len(releases) - 1; i >= 0; i-- {
			releases[i]()
		}
	}, nil
}

// MaxRewriteRunes 返回该用户润色单次最大字数
func (l *Limiter) MaxRewriteRunes(ctx context.Context, userID string) int {
	u := l.loadUser(ctx, userID)
	plan := effectivePlan(u)
	if u.Role == "admin" {
		plan = PlanAdmin
	}
	return l.planConfig(plan).RewriteMaxRunes
}

// MaxTranscribeBytes 返回该用户语音转文字单次最大音频字节数
func (l *Limiter) MaxTranscribeBytes(ctx context.Context, userID string) int64 {
	u := l.loadUser(ctx, userID)
	plan := effectivePlan(u)
	if u.Role == "admin" {
		plan = PlanAdmin
	}
	if n := l.planConfig(plan).TranscribeMaxBytes; n > 0 {
		return n
	}
	return 25 << 20
}

// RecordUsage 记录一次 AI 调用的实际用量并更新配额。
// 频率始终消费（防刷）；每日请求次数与 token 仅在成功时扣减。
func (l *Limiter) RecordUsage(ctx context.Context, rec UsageRecord) {
	l.consumeRate(rec.UserID, rec.Feature)

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

	if !rec.Success {
		return
	}

	today := time.Now().Format("2006-01-02")
	u := l.loadUser(ctx, rec.UserID)
	plan := recordPlan(u)

	count := 0
	if rec.CountQuota {
		count = 1
	}

	if rec.TrackUser {
		l.upsertUserQuota(ctx, model.AIUserQuota{
			UserID:       rec.UserID,
			Date:         today,
			Feature:      string(rec.Feature),
			RequestCount: count,
			TotalTokens:  rec.TotalTokens,
		})
		// 用户级 token 预算按全功能合计统计（feature='total' 行）
		l.upsertUserQuota(ctx, model.AIUserQuota{
			UserID:      rec.UserID,
			Date:        today,
			Feature:     "total",
			TotalTokens: rec.TotalTokens,
		})
	}

	l.upsertGlobalQuota(ctx, model.AIGlobalQuota{
		Plan:         plan,
		Date:         today,
		RequestCount: count,
		TotalTokens:  rec.TotalTokens,
	})

	// 全局 token 上限告警
	if l.config.OverallDailyTokenLimit > 0 {
		var sum struct{ Total int64 }
		l.db.WithContext(ctx).
			Model(&model.AIGlobalQuota{}).
			Where("date = ?", today).
			Select("COALESCE(SUM(total_tokens), 0) AS total").
			Scan(&sum)
		limit := int64(l.config.OverallDailyTokenLimit)
		if sum.Total >= limit {
			log.Printf("[AILimit] ⚠️ 全局每日 token 上限已达 (%d/%d)", sum.Total, limit)
		} else if sum.Total >= limit*80/100 {
			log.Printf("[AILimit] ⚠️ 全局每日 token 用量已达 80%% (%d/%d)", sum.Total, limit)
		}
	}
}

func (l *Limiter) upsertUserQuota(ctx context.Context, q model.AIUserQuota) {
	if err := l.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "date"}, {Name: "feature"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count": gorm.Expr("ai_user_quota.request_count + ?", q.RequestCount),
			"total_tokens":  gorm.Expr("ai_user_quota.total_tokens + ?", q.TotalTokens),
			"updated_at":    time.Now(),
		}),
	}).Create(&q).Error; err != nil {
		log.Printf("[AILimit] 更新用户配额失败: %v", err)
	}
}

func (l *Limiter) upsertGlobalQuota(ctx context.Context, q model.AIGlobalQuota) {
	if err := l.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "plan"}, {Name: "date"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count": gorm.Expr("ai_global_quota.request_count + ?", q.RequestCount),
			"total_tokens":  gorm.Expr("ai_global_quota.total_tokens + ?", q.TotalTokens),
			"updated_at":    time.Now(),
		}),
	}).Create(&q).Error; err != nil {
		log.Printf("[AILimit] 更新全局配额失败: %v", err)
	}
}

// UsageSummary 返回用户今日 AI 用量与套餐信息
func (l *Limiter) UsageSummary(ctx context.Context, userID string) (*UsageSummary, error) {
	u := l.loadUser(ctx, userID)
	today := time.Now().Format("2006-01-02")

	if u.Role == "admin" {
		return &UsageSummary{
			Plan:          PlanAdmin,
			PlanExpiresAt: u.PlanExpiresAt,
			Unlimited:     true,
			Features:      []FeatureUsage{},
		}, nil
	}

	plan := effectivePlan(u)
	pc := l.planConfig(plan)

	var rows []model.AIUserQuota
	if err := l.db.WithContext(ctx).
		Where("user_id = ? AND date = ?", userID, today).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	usedByFeature := make(map[string]int)
	var totalRow model.AIUserQuota
	l.db.WithContext(ctx).
		Where("user_id = ? AND date = ? AND feature = 'total'", userID, today).
		First(&totalRow)
	for _, r := range rows {
		usedByFeature[r.Feature] += r.RequestCount
	}

	var pool model.AIGlobalQuota
	l.db.WithContext(ctx).Where("date = ? AND plan = ?", today, plan).First(&pool)

	features := make([]FeatureUsage, 0, len(pc.FeatureConfigs))
	for _, f := range featureOrder {
		fc, ok := pc.FeatureConfigs[f]
		if !ok {
			continue
		}
		features = append(features, FeatureUsage{
			Feature:        f,
			UsedToday:      usedByFeature[string(f)],
			LimitPerDay:    fc.MaxPerDay,
			LimitPerMinute: fc.MaxPerMinute,
		})
	}

	return &UsageSummary{
		Plan:            plan,
		PlanExpiresAt:   u.PlanExpiresAt,
		DailyTokenLimit: pc.DailyTokenLimit,
		TokensUsedToday: totalRow.TotalTokens,
		PoolTokenLimit:  pc.GlobalTokenPool,
		PoolTokensUsed:  pool.TotalTokens,
		Features:        features,
	}, nil
}

var featureOrder = []Feature{
	FeatureEnrich,
	FeatureSuggestTitle,
	FeatureSummarize,
	FeatureSuggestTags,
	FeatureRewrite,
	FeatureVoicePolish,
	FeatureTranscribe,
	FeatureThreadSummary,
}

// secondsUntilMidnight 计算到午夜的秒数
func secondsUntilMidnight(now time.Time) int {
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
	return int(midnight.Sub(now).Seconds()) + 1
}
