// Package stt 提供语音转文字（Speech-to-Text）客户端。
// 底层调用火山引擎豆包流式语音识别 API（WebSocket 二进制协议）。
// 文档：https://docs.volcengine.com/docs/6561/1354869
package stt

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// 流式输入模式：说完一句后返回完整识别结果，准确率更高
	wsURL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"

	// 二进制协议常量
	protocolVersion = 0x1
	headerSize      = 0x1 // header size = 1 * 4 = 4 bytes

	// Message types
	msgFullClientRequest = 0x1 // 端上发送包含请求参数的 full client request
	msgAudioOnly         = 0x2 // 端上发送包含音频数据的 audio only request
	msgFullServerResp    = 0x9 // 服务端下发包含识别结果的 full server response
	msgServerError       = 0xF // 服务端处理错误

	// Message type specific flags
	flagNoSeq      = 0x0 // header 后无 sequence number
	flagSeqPos     = 0x1 // header 后有 sequence number，正数
	flagLastNoSeq  = 0x2 // header 后无 sequence number，最后一包
	flagSeqNeg     = 0x3 // header 后有 sequence number，负数（最后一包）

	// Serialization
	serializeJSON = 0x1
	serializeRaw  = 0x0

	// Compression
	compressNone = 0x0
)

var (
	apiKey     string
	resourceID string
)

// Init 初始化 STT 配置（应用启动时调用一次）。
func Init(key, resID string) {
	apiKey = strings.TrimSpace(key)
	resourceID = strings.TrimSpace(resID)
	if resourceID == "" {
		resourceID = "volc.bigasr.sauc.duration"
	}
}

// Enabled 返回 STT 是否已配置可用
func Enabled() bool {
	return apiKey != ""
}

// TranscribeRequest 语音转文字请求参数
type TranscribeRequest struct {
	AudioReader io.Reader
	Filename    string
	Language    string
}

// buildHeader 构建二进制协议 4 字节 header
func buildHeader(msgType, flags, serialization, compression byte) [4]byte {
	return [4]byte{
		(protocolVersion << 4) | headerSize,
		(msgType << 4) | flags,
		(serialization << 4) | compression,
		0x00, // reserved
	}
}

// Transcribe 调用火山引擎 ASR 将音频转为文字。
// 音频格式要求：PCM 16kHz 16-bit mono。
func Transcribe(ctx context.Context, req TranscribeRequest) (string, error) {
	if !Enabled() {
		return "", fmt.Errorf("VOLC_ASR_API_KEY 未配置")
	}

	// 读取全部音频数据
	audioData, err := io.ReadAll(req.AudioReader)
	if err != nil {
		return "", fmt.Errorf("读取音频数据失败: %v", err)
	}
	if len(audioData) == 0 {
		return "", fmt.Errorf("音频数据为空")
	}

	requestID := uuid.New().String()
	connectID := uuid.New().String()

	// 1. 建立 WebSocket 连接
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	header := http.Header{
		"X-Api-Key":        {apiKey},
		"X-Api-Resource-Id": {resourceID},
		"X-Api-Request-Id":  {requestID},
		"X-Api-Connect-Id":  {connectID},
	}

	conn, resp, err := dialer.DialContext(ctx, wsURL, header)
	if err != nil {
		if resp != nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return "", fmt.Errorf("WebSocket 连接失败 (%d): %s, err=%v", resp.StatusCode, string(body), err)
		}
		return "", fmt.Errorf("WebSocket 连接失败: %v", err)
	}
	defer conn.Close()

	// 设置读写超时，防止永久阻塞
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	logID := resp.Header.Get("X-Tt-Logid")
	log.Printf("[STT] WebSocket connected, logid=%s", logID)

	// 2. 发送 full client request（JSON 配置）
	configPayload, err := json.Marshal(map[string]interface{}{
		"user": map[string]string{
			"uid":      "ai-community",
			"platform": "Linux",
		},
		"audio": map[string]interface{}{
			"format":  "pcm",
			"codec":   "raw",
			"rate":    16000,
			"bits":    16,
			"channel": 1,
		},
		"request": map[string]interface{}{
			"model_name":  "bigmodel",
			"enable_itn":  true,
			"enable_punc": true,
		},
	})
	if err != nil {
		return "", err
	}

	if err := sendBinaryMessage(conn, msgFullClientRequest, flagNoSeq, serializeJSON, compressNone, 0, configPayload); err != nil {
		return "", fmt.Errorf("发送配置失败: %v", err)
	}

	// 3. 分批发送音频数据（每包约 200ms = 16000 * 2 * 0.2 = 6400 bytes）
	const chunkSize = 6400
	seq := 1
	for offset := 0; offset < len(audioData); offset += chunkSize {
		end := offset + chunkSize
		if end > len(audioData) {
			end = len(audioData)
		}
		chunk := audioData[offset:end]

		if err := sendBinaryMessage(conn, msgAudioOnly, flagSeqPos, serializeRaw, compressNone, int32(seq), chunk); err != nil {
			return "", fmt.Errorf("发送音频数据失败 (seq=%d): %v", seq, err)
		}
		seq++
	}

	// 4. 发送最后一包（负包，空 payload）
	if err := sendBinaryMessage(conn, msgAudioOnly, flagLastNoSeq, serializeRaw, compressNone, 0, nil); err != nil {
		return "", fmt.Errorf("发送结束标记失败: %v", err)
	}

	// 5. 接收服务端响应
	var fullText string
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				break
			}
			return "", fmt.Errorf("读取响应失败: %v", err)
		}
		if len(data) < 4 {
			return "", fmt.Errorf("响应数据太短")
		}

		// 解析 header
		msgType := (data[1] >> 4) & 0x0F
		flags := data[1] & 0x0F

		// 计算 payload 起始位置
		payloadStart := 4 // header
		if flags == flagSeqPos || flags == flagSeqNeg {
			payloadStart += 4 // sequence number
		}
		if len(data) < payloadStart+4 {
			return "", fmt.Errorf("响应数据不完整")
		}
		payloadLen := binary.BigEndian.Uint32(data[payloadStart : payloadStart+4])
		payloadStart += 4
		if uint32(len(data)-payloadStart) < payloadLen {
			return "", fmt.Errorf("payload 长度不匹配")
		}
		payload := data[payloadStart : payloadStart+int(payloadLen)]

		if msgType == msgServerError {
			return "", fmt.Errorf("服务端错误: %s", string(payload))
		}

		if msgType == msgFullServerResp {
			var resp struct {
				Result struct {
					Text string `json:"text"`
				} `json:"result"`
				// 兼容其他可能的响应格式
				Text     string `json:"text"`
				Definite bool   `json:"definite"`
			}
			if err := json.Unmarshal(payload, &resp); err != nil {
				log.Printf("[STT] 解析响应 JSON 失败: %v, payload=%s", err, string(payload))
				continue
			}
			if resp.Result.Text != "" {
				fullText = resp.Result.Text
			} else if resp.Text != "" {
				fullText = resp.Text
			}
			if resp.Definite {
				break // 最终结果
			}
		}
	}

	if fullText == "" {
		return "", fmt.Errorf("语音识别结果为空")
	}
	return strings.TrimSpace(fullText), nil
}

// sendBinaryMessage 发送一个二进制协议消息
func sendBinaryMessage(conn *websocket.Conn, msgType, flags, serialization, compression byte, seq int32, payload []byte) error {
	header := buildHeader(msgType, flags, serialization, compression)

	var buf []byte
	buf = append(buf, header[:]...)

	// 如果有 sequence number，追加 4 字节
	if flags == flagSeqPos || flags == flagSeqNeg {
		seqBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(seqBytes, uint32(seq))
		buf = append(buf, seqBytes...)
	}

	// 追加 payload size（4 字节大端）
	sizeBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(sizeBytes, uint32(len(payload)))
	buf = append(buf, sizeBytes...)

	// 追加 payload
	buf = append(buf, payload...)

	return conn.WriteMessage(websocket.BinaryMessage, buf)
}
