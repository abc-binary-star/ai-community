package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ailimit"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/stt"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/cloudwego/hertz/pkg/protocol/http1/resp"
)

var aiService = &service.AIService{}

// Enrich AI 三产物合并生成（标题 + 摘要 + 标签）
// POST /api/ai/enrich
//
// only 为空时一次出齐三项；传 title / summary / tags 时只重生成该项，
// 用于「标题不满意，换一批」这类场景，避免把三项一起重算。
func Enrich(ctx context.Context, c *app.RequestContext) {
	var req types.EnrichReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) < 10 {
		response.BadRequest(c, "内容太短，至少 10 个字")
		return
	}
	if len([]rune(req.Content)) > 40000 {
		response.BadRequest(c, "内容太长，最多 40000 字")
		return
	}

	if !ai.Enabled() {
		response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	result, err := aiService.Enrich(ctx, userID, req.Title, req.Content, req.Only)
	if err != nil {
		log.Printf("[Enrich] failed, err=%v", err)
		response.Error(c, consts.StatusServiceUnavailable, "AI 生成失败，请稍后重试")
		return
	}
	response.JSON(c, result)
}

// SuggestTitle AI 标题建议
// POST /api/ai/suggest-title
func SuggestTitle(ctx context.Context, c *app.RequestContext) {
	var req types.SuggestTitleReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) < 10 {
		response.BadRequest(c, "内容太短，至少 10 个字")
		return
	}
	if len([]rune(req.Content)) > 40000 {
		response.BadRequest(c, "内容太长，最多 40000 字")
		return
	}

	if !ai.Enabled() {
		response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	titles, err := aiService.SuggestTitle(ctx, userID, req.Content)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 标题建议失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"titles": titles})
}

// Rewrite AI 文本润色
// POST /api/ai/rewrite
func Rewrite(ctx context.Context, c *app.RequestContext) {
	var req types.RewriteReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	limiter := ailimit.Get()
	maxRunes := 40000
	if limiter != nil {
		maxRunes = limiter.MaxRewriteRunes(ctx, userID)
	}
	if len([]rune(req.Content)) < 2 {
		response.BadRequest(c, "内容太短")
		return
	}
	if len([]rune(req.Content)) > maxRunes {
		response.BadRequest(c, rewriteTooLongMessage(maxRunes))
		return
	}
	if len([]rune(req.Selection)) > maxRunes {
		response.BadRequest(c, rewriteTooLongMessage(maxRunes))
		return
	}

	result, err := aiService.Rewrite(ctx, userID, req.Content, req.Selection, req.Style)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 文本润色失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"result": result})
}

// RewriteStream 流式润色：按段落分批发送给 AI，逐段通过 SSE 返回。
// 适合全文润色场景，用户不用等整篇文章处理完才能看到结果。
// POST /api/ai/rewrite-stream
func RewriteStream(ctx context.Context, c *app.RequestContext) {
	var req types.RewriteReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	limiter := ailimit.Get()
	maxRunes := 40000
	if limiter != nil {
		maxRunes = limiter.MaxRewriteRunes(ctx, userID)
	}
	if len([]rune(req.Content)) < 2 {
		response.BadRequest(c, "内容太短")
		return
	}
	if len([]rune(req.Content)) > maxRunes {
		response.BadRequest(c, rewriteTooLongMessage(maxRunes))
		return
	}
	// 流式润色仅支持全文，选段走原接口
	if req.Selection != "" {
		response.BadRequest(c, "选段润色请使用 /api/ai/rewrite")
		return
	}
	if !ai.Enabled() {
		response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
		return
	}

	// 流式润色一次用户请求只计 1 次配额：开始前预留，分片只记 token
	if limiter != nil {
		if err := limiter.ReserveRequest(ctx, userID, ailimit.FeatureRewrite); err != nil {
			reason, retryAfter := limitErrorParts(err)
			if retryAfter > 0 {
				c.Header("Retry-After", strconv.Itoa(retryAfter))
			}
			response.Error(c, consts.StatusTooManyRequests, reason)
			return
		}
		ctx = ai.WithTokensOnlyQuota(ctx)
	}

	// SSE 头
	c.SetStatusCode(consts.StatusOK)
	c.SetContentType("text/event-stream")
	c.Response.Header.Set("Cache-Control", "no-cache")
	c.Response.Header.Set("Connection", "keep-alive")
	c.Response.Header.Set("X-Accel-Buffering", "no")

	// 劫持 writer 走 chunked 编码，否则 Hertz 会缓冲整个响应体，
	// 客户端要等全部段落跑完才收到数据，流式就失去意义。
	c.Response.HijackWriter(resp.NewChunkedBodyWriter(&c.Response, c.GetWriter()))

	// 按 \n\n（空行）切分段落块，每块不超过 5000 字
	chunks := splitForRewrite(req.Content, 5000)

	for i, chunk := range chunks {
		result, err := aiService.RewriteChunk(ctx, userID, chunk, req.Style, i, len(chunks))
		if err != nil {
			writeSSE(c, map[string]interface{}{"error": err.Error()})
			return
		}
		writeSSE(c, map[string]interface{}{
			"index":  i,
			"total":  len(chunks),
			"result": result,
		})
	}
	writeSSE(c, map[string]interface{}{"done": true})
}

// splitForRewrite 按空行切分文本，保证每块不超过 maxChars 个 rune。
// 单段超长时在句号/换行处硬切。
func splitForRewrite(text string, maxChars int) []string {
	paragraphs := strings.Split(text, "\n\n")
	var chunks []string
	var current strings.Builder
	currentLen := 0

	flush := func() {
		if currentLen > 0 {
			chunks = append(chunks, current.String())
			current.Reset()
			currentLen = 0
		}
	}

	for _, para := range paragraphs {
		paraRunes := len([]rune(para))
		// 单段就超限：在句号处拆分
		if paraRunes > maxChars {
			flush()
			for _, sub := range splitLongParagraph(para, maxChars) {
				chunks = append(chunks, sub)
			}
			continue
		}
		if currentLen+paraRunes+2 > maxChars {
			flush()
		}
		if currentLen > 0 {
			current.WriteString("\n\n")
			currentLen += 2
		}
		current.WriteString(para)
		currentLen += paraRunes
	}
	flush()
	return chunks
}

// splitLongParagraph 在句号/问号/感叹号/换行处切分超长段落
func splitLongParagraph(para string, maxChars int) []string {
	runes := []rune(para)
	var chunks []string
	for start := 0; start < len(runes); start += maxChars {
		end := start + maxChars
		if end >= len(runes) {
			chunks = append(chunks, string(runes[start:]))
			break
		}
		// 在 maxChars 附近往前找句末标点
		cutAt := end
		for j := end; j > start+maxChars/2; j-- {
			if runes[j-1] == '。' || runes[j-1] == '？' || runes[j-1] == '！' ||
				runes[j-1] == '.' || runes[j-1] == '\n' || runes[j-1] == '；' {
				cutAt = j
				break
			}
		}
		chunks = append(chunks, string(runes[start:cutAt]))
		start = cutAt - maxChars // for 循环会 += maxChars，这里补偿
	}
	return chunks
}

// writeSSE 写一条 SSE 事件并立即 flush，保证客户端能马上收到这一段
func writeSSE(c *app.RequestContext, data map[string]interface{}) {
	body, _ := json.Marshal(data)
	payload := make([]byte, 0, len(body)+8)
	payload = append(payload, "data: "...)
	payload = append(payload, body...)
	payload = append(payload, '\n', '\n')
	if _, err := c.Write(payload); err != nil {
		log.Printf("[AI/RewriteStream] write failed: %v", err)
		return
	}
	if err := c.Flush(); err != nil {
		log.Printf("[AI/RewriteStream] flush failed: %v", err)
	}
}

// Transcribe 语音转文字
// POST /api/ai/transcribe (multipart: file=音频文件)
func Transcribe(ctx context.Context, c *app.RequestContext) {
	if !stt.Enabled() {
		response.Error(c, consts.StatusServiceUnavailable, "语音识别功能未开启")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	limiter := ailimit.Get()
	maxAudioSize := int64(25 << 20)
	if limiter != nil {
		maxAudioSize = limiter.MaxTranscribeBytes(ctx, userID)
	}

	// 从 multipart 表单读取音频文件
	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "请上传音频文件")
		return
	}

	if int64(fileHeader.Size) > maxAudioSize {
		response.BadRequest(c, transcribeTooLongMessage(maxAudioSize))
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		response.BadRequest(c, "读取音频文件失败")
		return
	}
	defer file.Close()

	start := time.Now()
	text, err := stt.Transcribe(ctx, stt.TranscribeRequest{
		AudioReader: file,
		Filename:    fileHeader.Filename,
		Language:    "zh",
	})
	durationMs := int(time.Since(start).Milliseconds())
	if limiter != nil {
		// 转写此前从未计量，这里补齐：成功计 1 次；失败只消费频率防刷
		limiter.RecordUsage(ctx, ailimit.UsageRecord{
			UserID:      userID,
			Feature:     ailimit.FeatureTranscribe,
			Model:       "volc-asr",
			DurationMs:  durationMs,
			Success:     err == nil,
			ErrorMessage: errMessage(err),
			CountQuota:  true,
			TrackUser:   true,
		})
	}
	if err != nil {
		log.Printf("[STT] 语音识别失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"text": text})
}

// GetAIUsage 返回今日各功能剩余配额与 token 用量
// GET /api/ai/usage
func GetAIUsage(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	limiter := ailimit.Get()
	if limiter == nil {
		response.Error(c, consts.StatusServiceUnavailable, "AI 用量服务不可用")
		return
	}
	summary, err := limiter.UsageSummary(ctx, userID)
	if err != nil {
		log.Printf("[AI/Usage] 获取用量失败: %v", err)
		response.Error(c, 500, "获取 AI 用量失败")
		return
	}
	response.JSON(c, summary)
}

// GetAIPlan 返回当前套餐信息
// GET /api/ai/plan
func GetAIPlan(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	limiter := ailimit.Get()
	if limiter == nil {
		response.Error(c, consts.StatusServiceUnavailable, "AI 套餐服务不可用")
		return
	}
	summary, err := limiter.UsageSummary(ctx, userID)
	if err != nil {
		log.Printf("[AI/Plan] 获取套餐失败: %v", err)
		response.Error(c, 500, "获取 AI 套餐失败")
		return
	}
	response.JSON(c, map[string]interface{}{
		"plan":          summary.Plan,
		"planExpiresAt": summary.PlanExpiresAt,
		"unlimited":     summary.Unlimited,
		"dailyTokenLimit": summary.DailyTokenLimit,
	})
}

// UpgradePlan 订阅升级占位接口（支付渠道接入前返回明确提示）
// POST /api/billing/upgrade
func UpgradePlan(ctx context.Context, c *app.RequestContext) {
	response.Error(c, consts.StatusNotImplemented, "订阅支付功能尚未接入，请联系管理员开通")
}

func limitErrorParts(err error) (string, int) {
	if le, ok := err.(*ailimit.LimitError); ok {
		return le.Reason, le.RetryAfter
	}
	return err.Error(), 0
}

func errMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func rewriteTooLongMessage(maxRunes int) string {
	if maxRunes >= 40000 {
		return "内容太长，最多 40000 字"
	}
	return fmt.Sprintf("免费用户单次润色最多 %d 字，升级订阅可润色 40000 字", maxRunes)
}

func transcribeTooLongMessage(maxBytes int64) string {
	if maxBytes >= 25<<20 {
		return "音频文件太大，最多 25MB"
	}
	seconds := int(maxBytes / 32000)
	return fmt.Sprintf("免费用户单次语音最长约 %d 分钟，升级订阅可上传最长 25MB", seconds/60)
}

// Summarize AI 摘要生成
// POST /api/ai/summarize
func Summarize(ctx context.Context, c *app.RequestContext) {
	var req types.SummarizeReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) > 40000 {
		response.BadRequest(c, "内容太长，最多 40000 字")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	summary, err := aiService.Summarize(ctx, userID, req.Content)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 摘要生成失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"summary": summary})
}

// VoicePolish AI 语音转录文本润色
// POST /api/ai/voice-polish
func VoicePolish(ctx context.Context, c *app.RequestContext) {
	var req types.VoicePolishReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	if len([]rune(req.Content)) < 2 {
		response.BadRequest(c, "内容太短")
		return
	}
	if len([]rune(req.Content)) > 40000 {
		response.BadRequest(c, "内容太长，最多 40000 字")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	result, err := aiService.VoicePolish(ctx, userID, req.Content, req.Style, req.Target)
	if err != nil {
		if !ai.Enabled() {
			response.Error(c, consts.StatusServiceUnavailable, "AI 功能未开启")
			return
		}
		log.Printf("[AI] 语音润色失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, err.Error())
		return
	}
	response.JSON(c, map[string]interface{}{"result": result})
}
