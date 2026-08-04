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

// UsageInfo 单次调用的 token 用量
type UsageInfo struct {
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
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
	// UserID 调用者用户 ID（必填，用于限制检查和用量追踪）
	UserID string
	// Feature 功能标识（必填，用于限制检查和用量追踪）
	Feature string
}

// UsageHook 在每次 Chat 调用完成后被调用，用于记录用量。
// 由 ailimit 包在应用启动时注入，ai 包本身不依赖数据库。
type UsageHook func(ctx context.Context, userID, feature, model string, usage UsageInfo, durationMs int, err error)

// PreCheckHook 在每次 Chat 调用前被调用，用于检查是否允许调用。
// 返回 error 时 Chat 直接返回该错误，不发起 LLM 请求。
// 由 ailimit 包在应用启动时注入。
type PreCheckHook func(ctx context.Context, userID, feature string) error

var (
	apiKey     string
	baseURL    string
	model      string
	httpClient = &http.Client{}

	usageHook     UsageHook
	preCheckHook  PreCheckHook
	concurrentSem chan struct{}
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

// SetUsageHook 设置用量记录钩子（由 ailimit 包注入）
func SetUsageHook(h UsageHook) {
	usageHook = h
}

// SetPreCheckHook 设置调用前限制检查钩子（由 ailimit 包注入）
func SetPreCheckHook(h PreCheckHook) {
	preCheckHook = h
}

// SetMaxConcurrent 设置全局最大并发 AI 调用数
func SetMaxConcurrent(n int) {
	if n > 0 {
		concurrentSem = make(chan struct{}, n)
	}
}

// Chat 发起一次对话请求，返回模型生成的文本内容。
// 限制检查（频率/配额/全局token上限）在调用前自动执行，
// 调用方无需手动接入限制模块。
func Chat(ctx context.Context, req ChatRequest) (string, error) {
	if !Enabled() {
		return "", fmt.Errorf("DEEPSEEK_API_KEY 未配置")
	}

	// 强制检查：限制器已注入但 UserID/Feature 为空时报错
	if preCheckHook != nil {
		if req.UserID == "" {
			return "", fmt.Errorf("ai.Chat: UserID 不能为空，请从 handler 传入用户 ID")
		}
		if req.Feature == "" {
			return "", fmt.Errorf("ai.Chat: Feature 不能为空，请在 ailimit 包中注册功能标识")
		}
		if err := preCheckHook(ctx, req.UserID, req.Feature); err != nil {
			return "", err
		}
	}

	start := time.Now()

	// 全局并发控制
	if concurrentSem != nil {
		select {
		case concurrentSem <- struct{}{}:
			defer func() { <-concurrentSem }()
		case <-ctx.Done():
			return "", ctx.Err()
		}
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
		invokeUsageHook(ctx, req, UsageInfo{}, start, err)
		return "", fmt.Errorf("AI 服务请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		err := fmt.Errorf("AI 服务请求失败 (%d): %s", resp.StatusCode, string(respBody))
		invokeUsageHook(ctx, req, UsageInfo{}, start, err)
		return "", err
	}

	var data struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		invokeUsageHook(ctx, req, UsageInfo{}, start, err)
		return "", err
	}
	if len(data.Choices) == 0 {
		err := fmt.Errorf("AI 返回内容为空")
		invokeUsageHook(ctx, req, UsageInfo{}, start, err)
		return "", err
	}

	usage := UsageInfo{
		PromptTokens:     data.Usage.PromptTokens,
		CompletionTokens: data.Usage.CompletionTokens,
		TotalTokens:      data.Usage.TotalTokens,
	}
	invokeUsageHook(ctx, req, usage, start, nil)

	return strings.TrimSpace(data.Choices[0].Message.Content), nil
}

// invokeUsageHook 安全调用用量钩子（若已设置）
func invokeUsageHook(ctx context.Context, req ChatRequest, usage UsageInfo, start time.Time, err error) {
	if usageHook == nil {
		return
	}
	durationMs := int(time.Since(start).Milliseconds())
	usageHook(ctx, req.UserID, req.Feature, model, usage, durationMs, err)
}
