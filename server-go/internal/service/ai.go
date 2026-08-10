package service

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/digest"
)

// AIService AI 辅助创作服务（无状态）
type AIService struct{}

// titleCache 标题建议缓存。标题、摘要各自独立缓存，
// 因为同一篇正文的两种产物互不复用。
var titleCache = digest.NewCache(digest.DefaultTTL, 0)

// summaryCache 摘要缓存
var summaryCache = digest.NewCache(digest.DefaultTTL, 0)

// styleDesc 将前端风格 key 映射为中文描述。
// 编辑器面板和语音输入各自维护一套风格列表，这里同时兼容两者：
// 编辑器 5 种（natural/formal/friendly/concise/vivid）+ 语音 4 种（含 casual）
func styleDesc(style string) string {
	switch style {
	case "natural", "":
		return "自然流畅"
	case "formal":
		return "正式严谨"
	case "casual":
		return "口语轻松"
	case "friendly":
		return "轻松亲切"
	case "concise":
		return "简洁精炼"
	case "vivid":
		return "生动细节"
	default:
		return "自然流畅"
	}
}

// SuggestTitle 根据帖子内容生成 3 个候选标题
func (s *AIService) SuggestTitle(ctx context.Context, userID, content string) ([]string, error) {
	cacheKey := digest.NormHash("title", content)
	if cached, ok := aiCacheGet(ctx, titleCache, "title", cacheKey); ok && cached != "" {
		return strings.Split(cached, "\n"), nil
	}

	d := digest.For(content, digest.BudgetTitle)
	truncated := d.Text

	systemPrompt := `你是社区帖子标题助手。根据帖子内容生成 3 个不同风格的标题。

要求：
- 每个标题 8-30 字
- 3 个风格各异：一个直白概括、一个引发好奇、一个口语化
- 不加引号、序号或前缀
- 每行一个，共 3 行，不输出其他内容`

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        truncated,
		MaxTokens:   500,
		Temperature: 0.7,
		UserID:      userID,
		Feature:     "suggest_title",
	})
	if err != nil {
		log.Printf("[AI/SuggestTitle] failed to call AI, err=%v", err)
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

	log.Printf("[AI/SuggestTitle] digest strategy=%s in=%d out=%d",
		d.Strategy, len([]rune(content)), len([]rune(truncated)))
	aiCacheSet(ctx, titleCache, "title", cacheKey, strings.Join(titles, "\n"))
	return titles, nil
}

// selectionContext 定位 selection 在 content 中的位置，返回前后各 n 字的上下文。
// 选段不在正文中（前端未同步、或用户改过正文）时返回空串，调用方退回无上下文模式。
func selectionContext(content, selection string, n int) (before, after string) {
	idx := strings.Index(content, selection)
	if idx < 0 {
		return "", ""
	}

	beforeRunes := []rune(content[:idx])
	if len(beforeRunes) > n {
		beforeRunes = beforeRunes[len(beforeRunes)-n:]
	}

	afterRunes := []rune(content[idx+len(selection):])
	if len(afterRunes) > n {
		afterRunes = afterRunes[:n]
	}

	return strings.TrimSpace(string(beforeRunes)), strings.TrimSpace(string(afterRunes))
}

// Rewrite 润色文本内容。selection 非空时只润色选段，否则润色全文。
func (s *AIService) Rewrite(ctx context.Context, userID, content, selection, style string) (string, error) {
	// 确定润色目标：有选段时润色选段，否则润色全文
	target := selection
	if target == "" {
		target = content
	}

	truncated := target
	if runes := []rune(truncated); len(runes) > 40000 {
		truncated = string(runes[:40000])
	}

	// 选段润色时取选段在原文中的前后各 200 字作为上下文
	var before, after string
	if selection != "" {
		before, after = selectionContext(content, selection, 200)
	}

	sd := styleDesc(style)
	isSelection := selection != ""

	var systemPrompt string
	if isSelection {
		systemPrompt = fmt.Sprintf(`你是社区内容润色助手。请对用户选中的文字片段做实质性润色改写，风格：%s。

要求：
- 修正错别字、标点误用和语病
- 主动优化措辞：替换口语化、重复、笼统的表达，用词更精准
- 重组句子结构：拆分冗长句、合并零碎句，让节奏更流畅
- 删除冗余赘词，让表达更凝练
- 保持原意和事实不变，不新增未提及的信息
- 保留原有段落数量和换行位置，不增删空行、不添加标题或列表
- 不增加表情符号，不添加 Markdown 加粗等标记
- 即使原文已通顺，也要在措辞和句式上做出可感知的优化
- 若输入含【上文】【下文】标记，它们仅供衔接参考；只输出【需要润色的片段】的润色结果
- 不加任何前言、后语或解释，直接输出润色后的文字`, sd)
	} else {
		systemPrompt = fmt.Sprintf(`你是社区内容润色助手。请帮用户润色整篇文章，风格：%s。

要求：
- 修正错别字和语病，确保用词准确
- 优化句子结构和表达流畅度
- 整理文本格式：合理使用标题、分段、列表等 Markdown 元素
- 段落间用空行分隔，长段落适当拆分
- 适当增加表情符号让内容更生动（每段最多 1-2 个）
- 适度使用加粗（**加粗**）强调重点，但不要整段加粗
- 保持原意不变，不改写事实内容
- 保留代码块、链接、图片等 Markdown 元素，不修改其内容
- 文中可能出现 AIPROTECTED0TOKEN、AIPROTECTED1TOKEN 等占位符（代表代码、链接或图片），必须原样保留，不要展开、改写或删除
- 不加任何前言或后语，直接输出润色后的内容`, sd)
	}

	// 选段润色用稍高温度，避免模型对已通顺的文字原样返回
	temperature := 0.3
	if isSelection {
		temperature = 0.6
	}

	userMsg := truncated
	if isSelection && (before != "" || after != "") {
		// 用显式标记划出待润色范围，避免模型把上下文也一起改写
		var b strings.Builder
		if before != "" {
			b.WriteString("【上文，仅供参考，不要输出】\n")
			b.WriteString(before)
			b.WriteString("\n\n")
		}
		b.WriteString("【需要润色的片段】\n")
		b.WriteString(truncated)
		if after != "" {
			b.WriteString("\n\n【下文，仅供参考，不要输出】\n")
			b.WriteString(after)
		}
		userMsg = b.String()
	}

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        userMsg,
		MaxTokens:   8000,
		Temperature: temperature,
		UserID:      userID,
		Feature:     "rewrite",
	})
	if err != nil {
		log.Printf("[AI/Rewrite] failed to call AI, err=%v", err)
		return "", err
	}

	if text == "" {
		return "", fmt.Errorf("AI 润色结果为空")
	}
	// 缩进由代码确定性处理，仅全文润色生效；选段润色保持原有格式
	if isSelection {
		return text, nil
	}
	return indentPlainParagraphs(text), nil
}

// RewriteChunk 润色单个分片。与 Rewrite 的全文润色用相同的 system prompt，
// 但提示 AI 这是文章的一部分，需保持上下文连贯。
func (s *AIService) RewriteChunk(ctx context.Context, userID, content, style string, index, total int) (string, error) {
	// 分片序号放在 user message 而非 system prompt，让所有分片的 system prompt
	// 完全一致。服务商对相同的 prompt 前缀提供上下文缓存优惠，
	// 原先把「第 i/n 部分」嵌进 system prompt 会让每片前缀都不同，主动放弃了该折扣。
	systemPrompt := fmt.Sprintf(`你是社区内容润色助手。请帮用户润色文章的一部分，风格：%s。
输入会标明当前是第几部分，请只润色该部分内容，并与相邻部分保持风格连贯。

要求：
- 修正错别字和语病，确保用词准确
- 优化句子结构和表达流畅度
- 整理文本格式：合理使用标题、分段、列表等 Markdown 元素
- 段落间用空行分隔
- 适度使用加粗强调重点
- 保持原意不变，不改写事实内容
- 保留代码块、链接、图片等 Markdown 元素
- 文中可能出现 AIPROTECTED0TOKEN、AIPROTECTED1TOKEN 等占位符（代表代码、链接或图片），必须原样保留
- 不加任何前言或后语，直接输出润色后的内容`, styleDesc(style))

	userMsg := fmt.Sprintf("【第 %d/%d 部分】\n%s", index+1, total, content)

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        userMsg,
		MaxTokens:   8000,
		Temperature: 0.3,
		UserID:      userID,
		Feature:     "rewrite",
	})
	if err != nil {
		log.Printf("[AI/RewriteChunk] part %d/%d failed: %v", index+1, total, err)
		return "", err
	}
	if text == "" {
		return "", fmt.Errorf("AI 润色结果为空（第 %d 部分）", index+1)
	}
	return indentPlainParagraphs(text), nil
}

// Summarize 根据帖子内容生成摘要（1-2 句话，供列表卡片展示）
func (s *AIService) Summarize(ctx context.Context, userID, content string) (string, error) {
	cacheKey := digest.NormHash("summary", content)
	if cached, ok := aiCacheGet(ctx, summaryCache, "summary", cacheKey); ok && cached != "" {
		return cached, nil
	}

	// 摘要预算给到 4000 字，社区帖子绝大多数在此范围内全文直通，
	// 只有极长文才压缩，把质量损失限制在极少数场景。
	d := digest.For(content, digest.BudgetSummarize)
	truncated := d.Text

	systemPrompt := `你是社区帖子摘要助手。根据帖子内容生成一句话摘要。

要求：
- 30-80 字，概括帖子的核心主题或关键信息
- 客观陈述，不加主观评价
- 不加引号、序号或前言后语
- 只输出摘要文本`

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        truncated,
		MaxTokens:   200,
		Temperature: 0.3,
		UserID:      userID,
		Feature:     "summarize",
	})
	if err != nil {
		log.Printf("[AI/Summarize] failed to call AI, err=%v", err)
		return "", err
	}
	if text == "" {
		return "", fmt.Errorf("AI 摘要结果为空")
	}

	log.Printf("[AI/Summarize] digest strategy=%s in=%d out=%d",
		d.Strategy, len([]rune(content)), len([]rune(truncated)))
	aiCacheSet(ctx, summaryCache, "summary", cacheKey, text)
	return text, nil
}

// VoicePolish 润色语音转录文本：去口水词、补标点、按语义分段，可选转为 Markdown 段落。
// target="comment" 时精简为评论风格；target="paragraph" 时展开为结构化段落。
func (s *AIService) VoicePolish(ctx context.Context, userID, content, style, target string) (string, error) {
	truncated := content
	if runes := []rune(truncated); len(runes) > 40000 {
		truncated = string(runes[:40000])
	}

	sd := styleDesc(style)

	var systemPrompt string
	if target == "comment" {
		systemPrompt = fmt.Sprintf(`你是语音转文字润色助手。用户通过语音输入了一段口语内容，请将其润色为适合发布的社区评论，风格：%s。

要求：
- 去除口水词（嗯、啊、那个、就是说、然后等）和重复语句
- 补充正确的标点符号
- 精简为 1-3 句话，保留核心观点
- 保持说话者的原意和语气，不添加未提及的信息
- 不加前言后语，直接输出润色后的评论`, sd)
	} else {
		systemPrompt = fmt.Sprintf(`你是语音转文字润色助手。用户通过语音输入了一段口语内容，请将其润色为适合插入文章的结构化段落，风格：%s。

要求：
- 去除口水词（嗯、啊、那个、就是说、然后等）和重复语句
- 补充正确的标点符号
- 按语义分段，段落间用空行分隔
- 如有明显的层次结构，可使用 Markdown 标题、列表等元素
- 适度使用加粗强调重点词句
- 保持说话者的原意和语气，不添加未提及的信息
- 不加前言后语，直接输出润色后的内容`, sd)
	}

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        truncated,
		MaxTokens:   8000,
		Temperature: 0.3,
		UserID:      userID,
		Feature:     "voice_polish",
	})
	if err != nil {
		log.Printf("[AI/VoicePolish] failed to call AI, err=%v", err)
		return "", err
	}
	if text == "" {
		return "", fmt.Errorf("AI 润色结果为空")
	}
	return text, nil
}

// indentPlainParagraphs 对纯文本段落应用首行缩进。
// 规则：段落跨多行，且段落起始处没有列表、引用、标题、代码块等特殊 Markdown 结构时，
// 在段落首行前加 2 个全角空格（\u3000\u3000）。
func indentPlainParagraphs(text string) string {
	lines := strings.Split(text, "\n")
	var out []string
	inParagraph := false
	paragraphHasSpecial := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// 空行：段落结束
		if trimmed == "" {
			inParagraph = false
			paragraphHasSpecial = false
			out = append(out, line)
			continue
		}

		// 特殊 Markdown 结构（列表、引用、标题、代码块、表格、分割线、图片、链接定义等）
		isSpecial := isSpecialMarkdownLine(trimmed)

		if isSpecial {
			inParagraph = false
			paragraphHasSpecial = true
			out = append(out, line)
			continue
		}

		if !inParagraph {
			// 新段落开始
			inParagraph = true
			if paragraphHasSpecial {
				// 前面紧跟特殊结构（如列表后面）：不缩进
				out = append(out, line)
			} else {
				// 普通段落首行：缩进 2 个全角空格
				out = append(out, "\u3000\u3000"+line)
			}
		} else {
			// 段落续行：不缩进
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}

// isSpecialMarkdownLine 判断一行是否为特殊 Markdown 结构
func isSpecialMarkdownLine(trimmed string) bool {
	// 标题 # ## ###...
	if strings.HasPrefix(trimmed, "#") {
		return true
	}
	// 列表 - * + 1. 1) 或任务列表 - [ ]
	if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") || strings.HasPrefix(trimmed, "+ ") ||
		strings.HasPrefix(trimmed, "- [") || strings.HasPrefix(trimmed, "* [") || strings.HasPrefix(trimmed, "+ [") {
		return true
	}
	// 有序列表：数字 + . 或 )
	for i := 0; i < len(trimmed) && i < 4; i++ {
		c := trimmed[i]
		if c < '0' || c > '9' {
			break
		}
		if (i+1 < len(trimmed)) && (trimmed[i+1] == '.' || trimmed[i+1] == ')') {
			return true
		}
	}
	// 引用
	if strings.HasPrefix(trimmed, ">") {
		return true
	}
	// 代码块
	if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
		return true
	}
	// 表格分隔行 | --- |
	if strings.HasPrefix(trimmed, "|") {
		return true
	}
	// 分割线 --- *** ___
	if trimmed == "---" || trimmed == "***" || trimmed == "___" ||
		strings.HasPrefix(trimmed, "--- ") || strings.HasPrefix(trimmed, "*** ") {
		return true
	}
	// 图片 ![]() 或链接 []() 或引用式 [text]: url
	if strings.HasPrefix(trimmed, "![") || (strings.HasPrefix(trimmed, "[") && strings.Contains(trimmed, "]: ")) {
		return true
	}
	return false
}
