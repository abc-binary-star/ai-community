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

// reviewSystemPrompt 审校系统 Prompt
const reviewSystemPrompt = `你是一位严格的翻译审校专家。请审校翻译质量，输出 PASS 或 FAIL 作为第一行，然后简要说明。
判定标准：
1. 术语是否与术语表一致（不一致 → FAIL）
2. 是否有漏译或错译（有 → FAIL）
3. HTML 标签结构是否完整（缺失 → FAIL）
4. 中文表达是否流畅（严重生硬 → FAIL）
输出格式：第一行 PASS 或 FAIL，随后用 1-2 句说明原因。`

// glossarySystemPrompt 术语抽取系统 Prompt
const glossarySystemPrompt = `你是书籍翻译的术语抽取专家。从书籍文本中抽取需要统一翻译的专有名词和关键术语。

抽取范围：
1. 人名、地名、机构名、品牌名（专有名词）
2. 专业技术术语、行业黑话、专有概念
3. 反复出现、译法容易不统一的普通名词

输出要求：
- 严格输出 JSON 数组，不要任何额外文字
- 每项结构：{"source": "原文", "target": "推荐译名", "type": "person|place|org|brand|term", "confidence": 0到1, "note": "备注（可空）"}
- 只输出数组本身`

// buildGlossaryPrompt 构建术语抽取 Prompt
func buildGlossaryPrompt(sampleTexts []string) string {
	var sb strings.Builder
	sb.WriteString("请从以下书籍文本中抽取专有名词和关键术语，输出 JSON 数组。\n\n")
	sb.WriteString("【书籍文本样本】\n")
	for i, t := range sampleTexts {
		if i >= 12 {
			break
		}
		if strings.TrimSpace(t) == "" {
			continue
		}
		sb.WriteString("--- 样本片段 ---\n")
		if len(t) > 600 {
			sb.WriteString(t[:600])
			sb.WriteString("\n")
		} else {
			sb.WriteString(t)
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

// consistencySystemPrompt 一致性校验系统 Prompt
const consistencySystemPrompt = `你是书籍翻译的一致性校验专家。检查译文中同一专有名词/术语是否翻译一致。

检查重点：
1. 同一人名/地名/机构在全书译名是否统一
2. 同一角色称呼是否一致
3. 专业术语译名是否统一

输出要求：
- 严格输出 JSON 数组，不要任何额外文字
- 每项结构：{"term": "原文术语", "variants": "不一致的译名（逗号分隔）", "count": 出现次数, "suggestion": "建议统一为", "confidence": "high|medium|low"}
- 没有问题则输出空数组 []`

// buildConsistencyPrompt 构建一致性校验 Prompt
func buildConsistencyPrompt(bookTitle, glossary string, samples []TextPair) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("请检查书籍《%s》译文的术语一致性，输出 JSON 数组。\n\n", bookTitle))
	if glossary != "" {
		sb.WriteString("【已确认术语表】\n")
		sb.WriteString(glossary)
		sb.WriteString("\n\n")
	}
	sb.WriteString("【原文-译文样本（可能存在不一致）】\n")
	for i, s := range samples {
		if i >= 25 {
			break
		}
		sb.WriteString(fmt.Sprintf("[%d] 原文: %s\n    译文: %s\n\n", i+1, truncateStr(s.Source, 200), truncateStr(s.Target, 200)))
	}
	return sb.String()
}

// qaSystemPrompt QA 评估系统 Prompt
const qaSystemPrompt = `你是书籍翻译的质量评估专家。对抽样译文进行质量评分。

评估维度（每项 1-5 分）：
- faithfulness: 忠实度（是否有错译、漏译、过度意译）
- fluency: 流畅度（中文是否自然、通顺、符合表达习惯）
- terminology: 术语一致性（是否遵循术语表、前后统一）
- format: 格式保持（HTML 标签、段落结构是否完整）

输出要求：
- 严格输出 JSON 对象，不要任何额外文字
- 结构：{"overall": 综合分, "scores": [{"dimension": "faithfulness", "score": 4, "comment": "评价"}], "issues": ["问题1"]}`

// buildQAPrompt 构建 QA 评估 Prompt
func buildQAPrompt(samples []TextPair, glossary string) string {
	var sb strings.Builder
	sb.WriteString("请评估以下抽样翻译的质量，输出 JSON 对象。\n\n")
	if glossary != "" {
		sb.WriteString("【术语表】\n")
		sb.WriteString(glossary)
		sb.WriteString("\n\n")
	}
	sb.WriteString("【抽样原文-译文】\n")
	for i, s := range samples {
		if i >= 20 {
			break
		}
		sb.WriteString(fmt.Sprintf("[%d] 原文: %s\n    译文: %s\n\n", i+1, truncateStr(s.Source, 300), truncateStr(s.Target, 300)))
	}
	return sb.String()
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
