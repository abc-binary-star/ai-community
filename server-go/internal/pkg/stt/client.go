// Package stt 提供语音转文字（Speech-to-Text）客户端。
// 底层调用 OpenAI Whisper API（/v1/audio/transcriptions），
// 支持 base URL 可配置，可对接任何 OpenAI 兼容的 STT 服务。
package stt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

var (
	apiKey    string
	baseURL   string
	httpClient = &http.Client{}
)

// Init 初始化 STT 配置（应用启动时调用一次）。
// 未配置 OPENAI_API_KEY 时 Enabled() 返回 false，调用方应降级。
func Init(key, url string) {
	apiKey = strings.TrimSpace(key)
	baseURL = strings.TrimSpace(url)
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}
	httpClient = &http.Client{Timeout: 120 * time.Second}
}

// Enabled 返回 STT 是否已配置可用
func Enabled() bool {
	return apiKey != ""
}

// TranscribeRequest 语音转文字请求参数
type TranscribeRequest struct {
	// AudioReader 音频数据读取器
	AudioReader io.Reader
	// Filename 文件名（含扩展名，如 audio.webm），Whisper 据此判断格式
	Filename string
	// Language 语言代码（如 zh-CN、en），空则自动检测
	Language string
}

// Transcribe 调用 Whisper API 将音频转为文字。
// 返回识别出的纯文本。
func Transcribe(ctx context.Context, req TranscribeRequest) (string, error) {
	if !Enabled() {
		return "", fmt.Errorf("OPENAI_API_KEY 未配置")
	}

	// 构建 multipart/form-data 请求体
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// file 字段
	part, err := writer.CreateFormFile("file", req.Filename)
	if err != nil {
		return "", fmt.Errorf("创建表单字段失败: %v", err)
	}
	if _, err := io.Copy(part, req.AudioReader); err != nil {
		return "", fmt.Errorf("写入音频数据失败: %v", err)
	}

	// model 字段
	if err := writer.WriteField("model", "whisper-1"); err != nil {
		return "", err
	}
	// language 字段（可选，提升中文识别准确率）
	if req.Language != "" {
		if err := writer.WriteField("language", req.Language); err != nil {
			return "", err
		}
	}
	// response_format 字段，使用 json（默认）
	if err := writer.WriteField("response_format", "json"); err != nil {
		return "", err
	}

	if err := writer.Close(); err != nil {
		return "", err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/audio/transcriptions", &body)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("STT 服务请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("STT 服务请求失败 (%d): %s", resp.StatusCode, string(respBody))
	}

	var data struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}
	if data.Text == "" {
		return "", fmt.Errorf("语音识别结果为空")
	}
	return strings.TrimSpace(data.Text), nil
}
