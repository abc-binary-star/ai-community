// Package embedding 提供可选的文本向量化客户端（OpenAI 兼容 /v1/embeddings）。
//
// 想法语义邻居（近邻边）依赖向量检索。设计文档明确指出：向量化是整个方案里
// 最容易翻车的地方，不应进入首版主路径。因此本包做成完全可选、按配置开关：
// 未配置 EMBEDDING_API_KEY 时 Enabled() 返回 false，所有调用方应降级为「无近邻」，
// 绝不因为向量能力缺失而影响想法本身的创建、展示与分发。
package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var (
	apiKey     string
	baseURL    string
	model      string
	dimensions int
	httpClient = &http.Client{Timeout: 30 * time.Second}
)

// Init 初始化向量化客户端（应用启动时调用一次）。
// key 为空时 Enabled() 返回 false，调用方应降级。
func Init(key, url, mdl string, dim int) {
	apiKey = strings.TrimSpace(key)
	baseURL = strings.TrimSpace(url)
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}
	model = strings.TrimSpace(mdl)
	if model == "" {
		model = "text-embedding-3-small"
	}
	dimensions = dim
	if dimensions <= 0 {
		dimensions = 1536
	}
}

// Enabled 返回向量化能力是否已配置可用。
func Enabled() bool {
	return apiKey != ""
}

// Dim 返回配置的向量维度，供建表时确定 vector 列宽度。
func Dim() int {
	if dimensions <= 0 {
		return 1536
	}
	return dimensions
}

type embedReq struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type embedResp struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Embed 为单段文本生成向量。未启用或失败时返回错误，调用方应把它当作
// 「本次拿不到向量」处理而不是致命错误。
func Embed(ctx context.Context, text string) ([]float32, error) {
	if !Enabled() {
		return nil, fmt.Errorf("embedding 未配置")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("空文本不生成向量")
	}

	body, err := json.Marshal(embedReq{Model: model, Input: []string{text}})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding 请求失败 status=%d body=%s", resp.StatusCode, string(raw))
	}

	var parsed embedResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("embedding 返回错误: %s", parsed.Error.Message)
	}
	if len(parsed.Data) == 0 || len(parsed.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("embedding 返回空向量")
	}
	return parsed.Data[0].Embedding, nil
}

// ToVectorLiteral 把向量转成 pgvector 的文本字面量，形如 [0.1,0.2,...]。
func ToVectorLiteral(vec []float32) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, v := range vec {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(v), 'f', -1, 32))
	}
	b.WriteByte(']')
	return b.String()
}
