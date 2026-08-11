package agent

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// ModelProvider LLM 模型提供者，封装豆包 ARK ChatModel
type ModelProvider struct {
	cfg *config.LLMConfig
}

// NewModelProvider 创建模型提供者
func NewModelProvider(cfg *config.LLMConfig) *ModelProvider {
	return &ModelProvider{cfg: cfg}
}

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
// 注意：此处为骨架实现，Phase 3 将接入 Eino ChatModel + Graph 编排
func (p *ModelProvider) Translate(ctx context.Context, input TranslateInput) (TranslateOutput, error) {
	if p.cfg.APIKey == "" || p.cfg.APIKey == "${ARK_API_KEY}" {
		logger.L().Warn("ARK_API_KEY 未配置，返回模拟翻译结果（开发模式）")
		return TranslateOutput{
			TranslatedText: fmt.Sprintf("[模拟译文] %s", input.SourceText),
			UsedTokens:     len(input.SourceText) / 3,
		}, nil
	}

	prompt := buildTranslatePrompt(input)
	messages := []*schema.Message{
		schema.SystemMessage(systemPrompt),
		schema.UserMessage(prompt),
	}

	// TODO: Phase 3 - 使用 Eino ark.NewChatModel 创建 ChatModel 实例
	// model, err := ark.NewChatModel(ctx, &ark.ChatModelConfig{...})
	// result, err := model.Generate(ctx, messages)
	//
	// 当前阶段返回占位结果，确保骨架可运行
	_ = messages

	return TranslateOutput{
		TranslatedText: "[待接入 ARK API] " + input.SourceText,
		UsedTokens:     len(input.SourceText) / 3,
	}, nil
}

// Review 翻译质量审校
func (p *ModelProvider) Review(ctx context.Context, source, target, glossary string) (bool, string, error) {
	if p.cfg.APIKey == "" || p.cfg.APIKey == "${ARK_API_KEY}" {
		// 开发模式：直接通过
		return true, "开发模式跳过审校", nil
	}

	// TODO: Phase 3 - 接入 ReviewModel 审校
	_ = source
	_ = target
	_ = glossary
	return true, "", nil
}

// GenerateSummary 为一段文本生成摘要（用于上下文累积）
func (p *ModelProvider) GenerateSummary(ctx context.Context, text string) (string, error) {
	if p.cfg.APIKey == "" || p.cfg.APIKey == "${ARK_API_KEY}" {
		// 开发模式：取前 100 字符
		if len(text) > 100 {
			return text[:100], nil
		}
		return text, nil
	}

	// TODO: Phase 3 - 接入摘要生成
	return "", nil
}

// GetChatModel 返回 Eino ChatModel（Phase 3 使用）
func (p *ModelProvider) GetChatModel() model.ChatModel {
	// TODO: Phase 3 返回真实的 ark.ChatModel
	return nil
}
