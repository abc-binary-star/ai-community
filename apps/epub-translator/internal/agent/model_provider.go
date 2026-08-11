package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/cloudwego/eino-ext/components/model/ark"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// ModelProvider LLM 模型提供者，封装豆包 ARK ChatModel（Eino 组件）
// 未配置 APIKey 时自动降级为模拟模式，保证骨架可运行
type ModelProvider struct {
	cfg         *config.LLMConfig
	mu          sync.Mutex
	chatModel   model.ChatModel
	reviewModel model.ChatModel
	initialized bool
}

// NewModelProvider 创建模型提供者
func NewModelProvider(cfg *config.LLMConfig) *ModelProvider {
	return &ModelProvider{cfg: cfg}
}

// MockMode 是否处于模拟模式（未配置 APIKey）
func (p *ModelProvider) MockMode() bool {
	return p.cfg.APIKey == "" || p.cfg.APIKey == "${ARK_API_KEY}"
}

// ensureModels 惰性初始化 ChatModel 实例
func (p *ModelProvider) ensureModels(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.initialized {
		return nil
	}

	timeout := p.cfg.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	baseURL := p.cfg.BaseURL

	m, err := ark.NewChatModel(ctx, &ark.ChatModelConfig{
		APIKey:  p.cfg.APIKey,
		BaseURL: baseURL,
		Model:   p.cfg.Model,
		Timeout: &timeout,
	})
	if err != nil {
		return fmt.Errorf("创建翻译模型失败: %w", err)
	}

	rm := m
	reviewModel := p.cfg.ReviewModel
	if reviewModel != "" && reviewModel != p.cfg.Model {
		rm, err = ark.NewChatModel(ctx, &ark.ChatModelConfig{
			APIKey:  p.cfg.APIKey,
			BaseURL: baseURL,
			Model:   reviewModel,
			Timeout: &timeout,
		})
		if err != nil {
			return fmt.Errorf("创建审校模型失败: %w", err)
		}
	}

	p.chatModel = m
	p.reviewModel = rm
	p.initialized = true
	logger.L().Infof("LLM 模型就绪: 翻译=%s 审校=%s", p.cfg.Model, p.cfg.ReviewModel)
	return nil
}

// Generate 通用对话调用
func (p *ModelProvider) Generate(ctx context.Context, m model.ChatModel, system, user string, temperature float64) (string, error) {
	messages := []*schema.Message{
		schema.SystemMessage(system),
		schema.UserMessage(user),
	}
	opts := make([]model.Option, 0)
	if temperature > 0 {
		opts = append(opts, model.WithTemperature(float32(temperature)))
	}
	resp, err := m.Generate(ctx, messages, opts...)
	if err != nil {
		return "", err
	}
	return resp.Content, nil
}

// GenerateJSON 调用 LLM 并解析 JSON 输出（提取首个 JSON 对象/数组）
func (p *ModelProvider) GenerateJSON(ctx context.Context, m model.ChatModel, system, user string, out any) error {
	text, err := p.Generate(ctx, m, system, user, 0.1)
	if err != nil {
		return err
	}
	jsonStr := extractJSON(text)
	if jsonStr == "" {
		return fmt.Errorf("LLM 输出中未找到 JSON: %s", truncate(text, 200))
	}
	if err := json.Unmarshal([]byte(jsonStr), out); err != nil {
		return fmt.Errorf("解析 LLM JSON 失败: %w, 内容: %s", err, truncate(jsonStr, 200))
	}
	return nil
}

// ---------- 翻译 ----------

// TranslateInput 翻译节点输入
type TranslateInput struct {
	SourceText   string
	SourceLang   string
	TargetLang   string
	ContextLeft  string
	ContextRight string
	Glossary     string // 术语表 JSON 字符串
	ChapterTitle string
	Summary      string // 累积章节摘要
}

// TranslateOutput 翻译节点输出
type TranslateOutput struct {
	TranslatedText string
	UsedTokens     int
}

// Translate 调用 LLM 执行翻译
func (p *ModelProvider) Translate(ctx context.Context, input TranslateInput) (TranslateOutput, error) {
	if p.MockMode() {
		return TranslateOutput{
			TranslatedText: fmt.Sprintf("[模拟译文] %s", input.SourceText),
			UsedTokens:     estimateTokens(input.SourceText),
		}, nil
	}

	if err := p.ensureModels(ctx); err != nil {
		return TranslateOutput{}, err
	}

	prompt := buildTranslatePrompt(input)
	text, err := p.Generate(ctx, p.chatModel, systemPrompt, prompt, p.cfg.Temperature)
	if err != nil {
		return TranslateOutput{}, fmt.Errorf("翻译调用失败: %w", err)
	}

	return TranslateOutput{
		TranslatedText: strings.TrimSpace(text),
		UsedTokens:     estimateTokens(input.SourceText),
	}, nil
}

// ---------- 审校 ----------

// Review 翻译质量审校，返回是否通过及意见
func (p *ModelProvider) Review(ctx context.Context, source, target, glossary string) (bool, string, error) {
	if p.MockMode() {
		return true, "开发模式跳过审校", nil
	}
	if err := p.ensureModels(ctx); err != nil {
		return true, "", nil // 审校失败不阻断主流程
	}

	prompt := buildReviewPrompt(source, target, glossary)
	text, err := p.Generate(ctx, p.reviewModel, reviewSystemPrompt, prompt, 0.2)
	if err != nil {
		return true, "", err
	}

	upper := strings.ToUpper(strings.TrimSpace(text))
	if strings.HasPrefix(upper, "PASS") {
		return true, "", nil
	}
	return false, truncate(text, 300), nil
}

// ---------- 摘要 ----------

// GenerateSummary 为一段文本生成摘要（用于上下文累积）
func (p *ModelProvider) GenerateSummary(ctx context.Context, text string) (string, error) {
	if p.MockMode() {
		if len(text) > 100 {
			return text[:100], nil
		}
		return text, nil
	}
	if err := p.ensureModels(ctx); err != nil {
		return "", err
	}

	prompt := buildSummaryPrompt(text)
	return p.Generate(ctx, p.chatModel, "你是书籍翻译的上下文摘要助手。", prompt, 0.2)
}

// ---------- 阶段 3：术语抽取 ----------

// GlossaryTerm 术语候选
type GlossaryTerm struct {
	Source     string  `json:"source"`
	Target     string  `json:"target"`
	Type       string  `json:"type"` // person / place / org / brand / term
	Confidence float64 `json:"confidence"`
	Note       string  `json:"note,omitempty"`
}

// ExtractGlossary AI 从书中抽取专有名词候选术语表
func (p *ModelProvider) ExtractGlossary(ctx context.Context, sampleTexts []string) ([]GlossaryTerm, error) {
	if p.MockMode() {
		// 模拟模式：返回一个简单占位术语
		return []GlossaryTerm{
			{Source: "AI", Target: "AI（人工智能）", Type: "term", Confidence: 1.0, Note: "模拟抽取"},
		}, nil
	}
	if err := p.ensureModels(ctx); err != nil {
		return nil, err
	}

	prompt := buildGlossaryPrompt(sampleTexts)
	var terms []GlossaryTerm
	if err := p.GenerateJSON(ctx, p.chatModel, glossarySystemPrompt, prompt, &terms); err != nil {
		return nil, err
	}
	// 过滤空项
	valid := terms[:0]
	for _, t := range terms {
		if t.Source != "" && t.Target != "" {
			valid = append(valid, t)
		}
	}
	return valid, nil
}

// ---------- 阶段 6：一致性校验 ----------

// ConsistencyIssue 一致性疑似问题
type ConsistencyIssue struct {
	Term        string `json:"term"`
	Variants    string `json:"variants"` // 出现的不一致译名，逗号分隔
	Count       int    `json:"count"`
	Suggestion  string `json:"suggestion"`
	Confidence  string `json:"confidence"` // high / medium / low
}

// CheckConsistency AI 检查全文译名一致性
func (p *ModelProvider) CheckConsistency(ctx context.Context, bookTitle string, glossary string, samples []TextPair) ([]ConsistencyIssue, error) {
	if p.MockMode() {
		return []ConsistencyIssue{}, nil
	}
	if err := p.ensureModels(ctx); err != nil {
		return nil, err
	}

	prompt := buildConsistencyPrompt(bookTitle, glossary, samples)
	var issues []ConsistencyIssue
	if err := p.GenerateJSON(ctx, p.chatModel, consistencySystemPrompt, prompt, &issues); err != nil {
		return nil, err
	}
	return issues, nil
}

// ---------- 阶段 8：质量 QA ----------

// QAScore 质量评估项
type QAScore struct {
	Dimension    string  `json:"dimension"` // faithfulness / fluency / terminology / format
	Score        float64 `json:"score"`     // 1-5
	Comment      string  `json:"comment"`
}

// QAReport QA 评估报告
type QAReport struct {
	Overall   float64    `json:"overall"`
	Scores    []QAScore  `json:"scores"`
	Samples   int        `json:"samples"`
	Issues    []string   `json:"issues,omitempty"`
}

// AssessQuality AI 抽样评估翻译质量
func (p *ModelProvider) AssessQuality(ctx context.Context, samples []TextPair, glossary string) (QAReport, error) {
	if p.MockMode() {
		return QAReport{
			Overall: 5.0,
			Scores: []QAScore{
				{Dimension: "faithfulness", Score: 5.0, Comment: "模拟评估"},
				{Dimension: "fluency", Score: 5.0, Comment: "模拟评估"},
				{Dimension: "terminology", Score: 5.0, Comment: "模拟评估"},
			},
			Samples: len(samples),
		}, nil
	}
	if err := p.ensureModels(ctx); err != nil {
		return QAReport{}, err
	}

	prompt := buildQAPrompt(samples, glossary)
	var report QAReport
	if err := p.GenerateJSON(ctx, p.chatModel, qaSystemPrompt, prompt, &report); err != nil {
		return QAReport{}, err
	}
	if report.Samples == 0 {
		report.Samples = len(samples)
	}
	return report, nil
}

// GetChatModel 返回 Eino ChatModel（供 Graph 编排使用）
func (p *ModelProvider) GetChatModel(ctx context.Context) (model.ChatModel, error) {
	if p.MockMode() {
		return nil, fmt.Errorf("未配置 APIKey，无法创建真实模型")
	}
	if err := p.ensureModels(ctx); err != nil {
		return nil, err
	}
	return p.chatModel, nil
}

// ---------- 工具函数 ----------

// TextPair 原文-译文对
type TextPair struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// estimateTokens 估算 Token 数（中文按字符计，英文按 4 字符/token）
func estimateTokens(s string) int {
	if len(s) == 0 {
		return 0
	}
	// 简单估算：中文字符算 1 token，其余按 4 字符 1 token
	var cjk, other int
	for _, r := range s {
		if r > 0x2E80 {
			cjk++
		} else {
			other++
		}
	}
	return cjk + other/4 + 1
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// extractJSON 从 LLM 输出中提取第一个 JSON 对象或数组
func extractJSON(s string) string {
	start := -1
	end := -1
	// 优先找数组或对象起点
	openIdx := strings.IndexAny(s, "[{")
	if openIdx == -1 {
		return ""
	}
	start = openIdx
	depth := 0
	inStr := false
	escaped := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if inStr {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{', '[':
			depth++
		case '}', ']':
			depth--
			if depth == 0 {
				end = i
				return s[start : end+1]
			}
		}
	}
	return ""
}
