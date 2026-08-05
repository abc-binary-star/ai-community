// Package digest 从帖子正文中提取结构化摘录，供标题、摘要、标签等
// 「只需知道文章讲了什么」的 AI 任务复用，避免每个功能各自上传一遍全文。
//
// 社区场景下用户多为无排版的自由书写，因此提取不依赖 Markdown 结构：
// 先按标点分句，再用二字组词频给句子打分，取高分句按原序拼回。
// 正文在预算内时直接返回全文，不做任何有损处理。
package digest

import (
	"strings"
)

// Options 摘录提取参数
type Options struct {
	// MaxRunes 摘录长度上限（字符数）。正文不超过此值时原样返回。
	MaxRunes int
}

// Result 摘录提取结果
type Result struct {
	// Text 摘录正文
	Text string
	// Truncated 是否发生了有损压缩（false 表示返回的是完整原文）
	Truncated bool
	// Strategy 实际生效的策略，用于日志与灰度对比
	Strategy string
}

// 策略标识
const (
	StrategyFull     = "full"     // 全文直通，未压缩
	StrategyKeySent  = "key_sent" // 关键句抽取
	StrategyPosition = "position" // 位置采样兜底
)

// Extract 从正文提取摘录。返回的 Result.Text 始终非空（除正文本身为空）。
func Extract(content string, opts Options) Result {
	maxRunes := opts.MaxRunes
	if maxRunes <= 0 {
		maxRunes = 2000
	}

	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return Result{Text: "", Truncated: false, Strategy: StrategyFull}
	}

	// 预算内直接全文直通，不做任何有损处理
	if len([]rune(trimmed)) <= maxRunes {
		return Result{Text: trimmed, Truncated: false, Strategy: StrategyFull}
	}

	sentences := splitSentences(trimmed)
	// 分句失败，或切出来的多数片段是无标点硬切的产物（意识流写法）：
	// 此时片段不具备语义完整性，按关键句抽取反而会产生断头断尾的碎片，
	// 退回位置采样更稳妥。
	if len(sentences) <= 1 || hardCutRatio(sentences) > 0.5 {
		return Result{
			Text:      positionSample(trimmed, maxRunes),
			Truncated: true,
			Strategy:  StrategyPosition,
		}
	}

	text := selectKeySentences(sentences, maxRunes)
	if strings.TrimSpace(text) == "" {
		return Result{
			Text:      positionSample(trimmed, maxRunes),
			Truncated: true,
			Strategy:  StrategyPosition,
		}
	}

	return Result{Text: text, Truncated: true, Strategy: StrategyKeySent}
}

// hardCutRatio 返回硬切片段在全部片段中的占比。
// 占比高说明原文几乎没有标点，分句结果不可信。
func hardCutRatio(sentences []sentence) float64 {
	if len(sentences) == 0 {
		return 0
	}
	var n int
	for _, s := range sentences {
		if s.hardCut {
			n++
		}
	}
	return float64(n) / float64(len(sentences))
}
