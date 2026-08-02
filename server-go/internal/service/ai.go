package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
)

// AIService AI 辅助创作服务（无状态）
type AIService struct{}

// SuggestTitle 根据帖子内容生成 3 个候选标题
func (s *AIService) SuggestTitle(ctx context.Context, content string) ([]string, error) {
	truncated := content
	if runes := []rune(truncated); len(runes) > 2000 {
		truncated = string(runes[:2000])
	}

	systemPrompt := `你是一个社区帖子标题助手。根据帖子内容，生成 3 个不同风格的标题供用户选择。

要求：
1. 每个标题 8-30 个字，简洁有力
2. 3 个标题风格各异：一个直白概括、一个引发好奇、一个口语化
3. 不要加引号或序号
4. 只返回标题，每行一个，共 3 行`

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        truncated,
		MaxTokens:   500,
		Temperature: 0.7,
	})
	if err != nil {
		return nil, err
	}

	lines := strings.Split(text, "\n")
	var titles []string
	for _, line := range lines {
		t := strings.TrimSpace(line)
		// 去掉可能的序号前缀（1. 2. 3. 等）
		t = strings.TrimPrefix(t, "1.")
		t = strings.TrimPrefix(t, "2.")
		t = strings.TrimPrefix(t, "3.")
		t = strings.TrimPrefix(t, "1、")
		t = strings.TrimPrefix(t, "2、")
		t = strings.TrimPrefix(t, "3、")
		t = strings.TrimSpace(t)
		// 去掉引号（单双引号都可能出现）
		t = strings.Trim(t, "\"'")
		if len([]rune(t)) >= 2 && len([]rune(t)) <= 100 {
			titles = append(titles, t)
		}
		if len(titles) >= 3 {
			break
		}
	}

	if len(titles) == 0 {
		return nil, fmt.Errorf("AI 未能生成合适的标题")
	}
	return titles, nil
}

// Rewrite 润色文本内容
func (s *AIService) Rewrite(ctx context.Context, content, style string) (string, error) {
	truncated := content
	if runes := []rune(truncated); len(runes) > 5000 {
		truncated = string(runes[:5000])
	}

	styleDesc := "简洁自然"
	switch style {
	case "formal":
		styleDesc = "正式严谨"
	case "casual":
		styleDesc = "口语轻松"
	case "friendly":
		styleDesc = "亲和友好"
	}

	systemPrompt := fmt.Sprintf(`你是一个社区内容润色助手。请帮用户润色文本，风格为%s。

要求：
1. 修正错别字和语病
2. 优化句子结构和表达流畅度
3. 保持原意不变，不改写事实内容
4. 保留 Markdown 格式（代码块、链接、加粗等）
5. 不要加任何前言或后语，直接输出润色后的内容`, styleDesc)

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        truncated,
		MaxTokens:   2000,
		Temperature: 0.3,
	})
	if err != nil {
		return "", err
	}

	if text == "" {
		return "", fmt.Errorf("AI 润色结果为空")
	}
	return text, nil
}
