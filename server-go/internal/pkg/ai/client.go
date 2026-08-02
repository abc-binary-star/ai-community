// Package ai 提供统一的 LLM 网关客户端。
// 所有 AI 能力（标签、摘要、润色、追问等）都应通过本包调用模型，
// 避免各 service 直接重复拼接 OpenAI 兼容 HTTP 请求。
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Message 单条对话消息
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest 一次对话请求的参数
type ChatRequest struct {
	// System 系统提示词
	System string
	// User 用户消息（若为多条消息请使用 Messages）
	User string
	// Messages 完整消息列表；非空时优先于 System/User
	Messages []Message
	// MaxTokens 生成上限，默认 1000
	MaxTokens int
	// Temperature 采样温度，默认 0.3
	Temperature float64
	// Timeout 单次请求超时，默认 60s
	Timeout time.Duration
}

var (
	apiKey    string
	baseURL   string
	model     string
	httpClient = &http.Client{}
)

// Init 初始化网关配置（应用启动时调用一次）。
// 未配置 DEEPSEEK_API_KEY 时 Enabled() 返回 false，调用方应降级。
func Init(key, url, mdl string) {
	apiKey = strings.TrimSpace(key)
	baseURL = strings.TrimSpace(url)
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}
	model = strings.TrimSpace(mdl)
	if model == "" {
		model = "deepseek-chat"
	}
	httpClient = &http.Client{Timeout: 60 * time.Second}
}

// Enabled 返回 AI 网关是否已配置可用
func Enabled() bool {
	return apiKey != ""
}

// Chat 发起一次对话请求，返回模型生成的文本内容。
func Chat(ctx context.Context, req ChatRequest) (string, error) {
	if !Enabled() {
		return "", fmt.Errorf("DEEPSEEK_API_KEY 未配置")
	}

	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 1000
	}
	temperature := req.Temperature
	if temperature == 0 {
		temperature = 0.3
	}

	// 组装 messages：优先使用显式 Messages
	messages := req.Messages
	if len(messages) == 0 {
		messages = []Message{
			{Role: "system", Content: req.System},
			{Role: "user", Content: req.User},
		}
	}

	body, err := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  maxTokens,
		"temperature": temperature,
	})
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("AI 服务请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("AI 服务请求失败 (%d): %s", resp.StatusCode, string(respBody))
	}

	var data struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}
	if len(data.Choices) == 0 {
		return "", fmt.Errorf("AI 返回内容为空")
	}
	return strings.TrimSpace(data.Choices[0].Message.Content), nil
}
