package service

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
)

// AIService AI 辅助创作服务（无状态）
type AIService struct{}

// SuggestTitle 根据帖子内容生成 3 个候选标题
func (s *AIService) SuggestTitle(ctx context.Context, userID, content string) ([]string, error) {
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
	return titles, nil
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

	styleDesc := "简洁自然"
	switch style {
	case "formal":
		styleDesc = "正式严谨"
	case "casual":
		styleDesc = "口语轻松"
	case "friendly":
		styleDesc = "亲和友好"
	}

	// 选段润色和全文润色使用不同策略
	isSelection := selection != ""

	var systemPrompt string
	if isSelection {
		// 选段润色：只做文字层面的修正，不调整整体排版格式
		systemPrompt = fmt.Sprintf(`你是一个社区内容润色助手。请帮用户润色选中的文字片段，风格为%s。

要求：
1. 修正错别字和语病，确保用词准确
2. 优化句子结构和表达流畅度，使行文更自然
3. 保持原意不变，不改写事实内容
4. 不要调整段落结构、排版格式或增加表情符号（这些在全文润色时处理）
5. 不要加任何前言或后语，直接输出润色后的内容`, styleDesc)
	} else {
		// 全文润色：综合优化排版、格式、表情符号、加粗强调
		systemPrompt = fmt.Sprintf(`你是一个社区内容润色助手。请帮用户润色整篇文章，风格为%s。

要求：
1. 修正错别字和语病，确保用词准确
2. 优化句子结构和表达流畅度，使行文更自然
3. 整理文本格式：合理使用标题、分段、列表等 Markdown 元素，使层次分明
4. 优化排版：段落间用空行分隔，长段落适当拆分
5. 适当增加表情符号，让内容更生动有趣，但不过度使用（每段最多 1-2 个）
6. 适度使用加粗（**加粗**）强调重点句和重点词，让读者快速抓住核心信息，但不要整段加粗
7. 保持原意不变，不改写事实内容
8. 保留代码块（` + "```" + `）、链接、图片等 Markdown 元素，不修改其内容
9. 不要加任何前言或后语，直接输出润色后的内容`, styleDesc)
	}

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        truncated,
		MaxTokens:   8000,
		Temperature: 0.3,
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
	styleDesc := "简洁自然"
	switch style {
	case "formal":
		styleDesc = "正式严谨"
	case "casual":
		styleDesc = "口语轻松"
	case "friendly":
		styleDesc = "亲和友好"
	}

	systemPrompt := fmt.Sprintf(`你是一个社区内容润色助手。请帮用户润色文章的第 %d/%d 部分，风格为%s。

要求：
1. 修正错别字和语病，确保用词准确
2. 优化句子结构和表达流畅度，使行文更自然
3. 整理文本格式：合理使用标题、分段、列表等 Markdown 元素
4. 优化排版：段落间用空行分隔
5. 适度使用加粗强调重点
6. 保持原意不变，不改写事实内容
7. 保留代码块、链接、图片等 Markdown 元素
8. 不要加任何前言或后语，直接输出润色后的内容`, index+1, total, styleDesc)

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        content,
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
	truncated := content
	if runes := []rune(truncated); len(runes) > 40000 {
		truncated = string(runes[:40000])
	}

	systemPrompt := `你是一个社区帖子摘要助手。根据帖子内容，生成一句话摘要。

要求：
1. 30-80 个字，概括帖子的核心主题或关键信息
2. 客观陈述，不加主观评价
3. 不要加引号、序号或前言后语
4. 只输出摘要文本`

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
	return text, nil
}

// VoicePolish 润色语音转录文本：去口水词、补标点、按语义分段，可选转为 Markdown 段落。
// target="comment" 时精简为评论风格；target="paragraph" 时展开为结构化段落。
func (s *AIService) VoicePolish(ctx context.Context, userID, content, style, target string) (string, error) {
	truncated := content
	if runes := []rune(truncated); len(runes) > 40000 {
		truncated = string(runes[:40000])
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

	var systemPrompt string
	if target == "comment" {
		// 评论模式：精简为 1-3 句
		systemPrompt = fmt.Sprintf(`你是一个语音转文字润色助手。用户通过语音输入了一段口语内容，请将其润色为适合发布的社区评论，风格为%s。

要求：
1. 去除口语中的口水词（嗯、啊、那个、就是说、然后等）和重复语句
2. 补充正确的标点符号
3. 精简为 1-3 句话，保留核心观点
4. 保持说话者的原意和语气，不要添加未提及的信息
5. 不要加前言后语，直接输出润色后的评论`, styleDesc)
	} else {
		// 段落模式：展开为结构化 Markdown 段落，可插入到文章中
		systemPrompt = fmt.Sprintf(`你是一个语音转文字润色助手。用户通过语音输入了一段口语内容，请将其润色为适合插入文章的结构化段落，风格为%s。

要求：
1. 去除口语中的口水词（嗯、啊、那个、就是说、然后等）和重复语句
2. 补充正确的标点符号
3. 按语义分段，段落间用空行分隔
4. 如有明显的层次结构，可使用 Markdown 标题、列表等元素
5. 适度使用加粗强调重点词句
6. 保持说话者的原意和语气，不要添加未提及的信息
7. 不要加前言后语，直接输出润色后的内容`, styleDesc)
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
