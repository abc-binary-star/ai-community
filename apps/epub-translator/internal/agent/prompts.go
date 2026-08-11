package agent

import (
	"fmt"
	"strings"
)

// 翻译系统 Prompt
const systemPrompt = `你是一位专业的书籍翻译专家，擅长将外文书籍翻译为流畅自然的简体中文。

翻译要求：
1. 保持原文的语义和风格，译文需自然流畅，符合中文表达习惯
2. 严格保留所有 HTML 标签结构，只翻译标签内的文本内容
3. 专有名词（人名/地名/术语）按照术语表统一翻译
4. 保持段落结构和标点符号的合理性
5. 不要添加注释、解释或原文
6. 不要修改任何 HTML 属性、class、id 等
7. 输出仅包含翻译后的 HTML，不要有任何额外说明`

// buildTranslatePrompt 构建翻译 Prompt
func buildTranslatePrompt(input TranslateInput) string {
	var sb strings.Builder

	sb.WriteString("请将以下内容翻译为简体中文。\n\n")

	// 章节信息
	if input.ChapterTitle != "" {
		sb.WriteString(fmt.Sprintf("【当前章节】%s\n\n", input.ChapterTitle))
	}

	// 累积摘要上下文
	if input.Summary != "" {
		sb.WriteString("【前文摘要（保持情节连贯）】\n")
		sb.WriteString(input.Summary)
		sb.WriteString("\n\n")
	}

	// 术语表
	if input.Glossary != "" {
		sb.WriteString("【术语表（必须严格遵守）】\n")
		sb.WriteString(input.Glossary)
		sb.WriteString("\n\n")
	}

	// 前置上下文
	if input.ContextLeft != "" {
		sb.WriteString("【前文末尾（仅作上下文参考，不要翻译此段）】\n")
		sb.WriteString(input.ContextLeft)
		sb.WriteString("\n\n")
	}

	// 后置上下文
	if input.ContextRight != "" {
		sb.WriteString("【后文开头（仅作上下文参考，不要翻译此段）】\n")
		sb.WriteString(input.ContextRight)
		sb.WriteString("\n\n")
	}

	// 待翻译内容
	sb.WriteString("【需要翻译的内容（请翻译下方 HTML，保留所有标签结构）】\n")
	sb.WriteString(input.SourceText)

	return sb.String()
}

// buildReviewPrompt 构建审校 Prompt
func buildReviewPrompt(source, target, glossary string) string {
	var sb strings.Builder
	sb.WriteString("请审校以下翻译质量。\n\n")
	sb.WriteString("【原文】\n")
	sb.WriteString(source)
	sb.WriteString("\n\n【译文】\n")
	sb.WriteString(target)

	if glossary != "" {
		sb.WriteString("\n\n【术语表】\n")
		sb.WriteString(glossary)
	}

	sb.WriteString("\n\n请检查：\n")
	sb.WriteString("1. 术语是否与术语表一致\n")
	sb.WriteString("2. 是否有漏译或错译\n")
	sb.WriteString("3. HTML 标签结构是否完整\n")
	sb.WriteString("4. 中文表达是否流畅\n\n")
	sb.WriteString("如果质量合格，请回复 PASS。如果不合格，请回复 FAIL 并说明问题。")

	return sb.String()
}

// buildSummaryPrompt 构建摘要生成 Prompt
func buildSummaryPrompt(text string) string {
	return fmt.Sprintf("请用一句话（不超过50字）概括以下内容的核心信息，用于保持后续翻译的上下文连贯：\n\n%s", text)
}
