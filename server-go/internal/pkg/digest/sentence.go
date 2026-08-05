package digest

import (
	"regexp"
	"strings"
)

// sentence 一个句子单元
type sentence struct {
	index   int     // 在原文中的顺序，用于按原序拼回
	text    string  // 句子正文
	runes   int     // 字符数
	score   float64 // 重要度得分
	hardCut bool    // 是否来自「无标点硬切」，而非真正的句子边界
}

// 句末终止符（中英文）
var terminators = map[rune]bool{
	'。': true, '！': true, '？': true, '；': true,
	'…': true, '.': true, '!': true, '?': true, ';': true,
}

// 次级切分符，用于拆开超长的无句号长句
var subSeparators = map[rune]bool{
	'，': true, '、': true, ',': true, '：': true, ':': true,
}

// maxSentenceRunes 单句超过此长度时做次级切分，避免一句吃掉整个预算
const maxSentenceRunes = 200

// codeBlockRe 匹配围栏代码块（含未闭合的情况）
var codeBlockRe = regexp.MustCompile("(?s)```.*?(```|$)")

// stripCodeBlocks 去掉代码块正文，只留一个占位标记。
// 代码对标题、摘要、标签三类任务没有信息价值，却极占预算。
func stripCodeBlocks(s string) string {
	return codeBlockRe.ReplaceAllString(s, "（代码块）")
}

// splitSentences 按标点和换行分句。不依赖 Markdown 排版，
// 纯文本、无标点的意识流写法都能得到可用的句子序列。
func splitSentences(content string) []sentence {
	cleaned := stripCodeBlocks(content)

	var raw []string
	var buf strings.Builder

	flush := func() {
		if t := strings.TrimSpace(buf.String()); t != "" {
			raw = append(raw, t)
		}
		buf.Reset()
	}

	for _, r := range cleaned {
		// 换行本身就是边界：用户不写标点时，回车往往是唯一的分隔信号
		if r == '\n' || r == '\r' {
			flush()
			continue
		}
		buf.WriteRune(r)
		if terminators[r] {
			flush()
		}
	}
	flush()

	var out []sentence
	for _, s := range raw {
		for _, p := range splitLongSentence(s) {
			text := strings.TrimSpace(p.text)
			if text == "" {
				continue
			}
			out = append(out, sentence{
				index:   len(out),
				text:    text,
				runes:   len([]rune(text)),
				hardCut: p.hardCut,
			})
		}
	}
	return out
}

// piece 次级切分产出的片段
type piece struct {
	text    string
	hardCut bool
}

// splitLongSentence 把超长句在次级标点处拆开；仍然过长则按长度硬切。
// 硬切出来的片段会标记 hardCut，因为它们不是真正的语义单元。
func splitLongSentence(s string) []piece {
	rs := []rune(s)
	if len(rs) <= maxSentenceRunes {
		return []piece{{text: s}}
	}

	var mid []string
	var buf []rune
	for _, r := range rs {
		buf = append(buf, r)
		if len(buf) >= maxSentenceRunes && subSeparators[r] {
			mid = append(mid, string(buf))
			buf = nil
		}
	}
	if len(buf) > 0 {
		mid = append(mid, string(buf))
	}

	// 连一个次级标点都没有：硬切成定长块
	var final []piece
	for _, m := range mid {
		pr := []rune(m)
		if len(pr) <= maxSentenceRunes {
			final = append(final, piece{text: m})
			continue
		}
		for len(pr) > maxSentenceRunes {
			final = append(final, piece{text: string(pr[:maxSentenceRunes]), hardCut: true})
			pr = pr[maxSentenceRunes:]
		}
		if len(pr) > 0 {
			final = append(final, piece{text: string(pr), hardCut: true})
		}
	}
	return final
}
