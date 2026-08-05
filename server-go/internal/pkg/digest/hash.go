package digest

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

// 全角转半角映射：用户在不同输入法下敲出的标点不该击穿缓存
var punctFold = map[rune]rune{
	'，': ',', '。': '.', '！': '!', '？': '?', '；': ';',
	'：': ':', '（': '(', '）': ')', '“': '"', '”': '"',
	'‘': '\'', '’': '\'', '、': ',', '　': ' ',
}

var (
	// 连续空白压成一个空格
	multiSpaceRe = regexp.MustCompile(`[ \t]+`)
	// Markdown 强调符号：加粗、斜体、下划线、删除线
	emphasisRe = regexp.MustCompile(`[*_~]{1,3}`)
)

// Normalize 归一化正文，用于生成缓存 key。
//
// 目的是让「只改排版不改内容」的编辑仍然命中缓存：
// 用户发帖前反复调标点、加粗某个词、调整空行是常态，
// 直接对原文取哈希会导致缓存几乎永不命中。
func Normalize(content string) string {
	s := strings.TrimSpace(content)
	if s == "" {
		return ""
	}

	// 去掉 Markdown 强调符号（保留文字本身）
	s = emphasisRe.ReplaceAllString(s, "")

	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if folded, ok := punctFold[r]; ok {
			b.WriteRune(folded)
			continue
		}
		// 统一大小写：标题里改个字母大小写不该算内容变化
		if r >= 'A' && r <= 'Z' {
			b.WriteRune(r + 32)
			continue
		}
		b.WriteRune(r)
	}
	s = b.String()

	// 逐行去首尾空白（含用户手动加的全角缩进），再把换行折叠成空格。
	//
	// 换行在本项目里属于排版而非内容：产品流程本身就是「用户随性写、AI 重排版」，
	// 分段方式会被润色改写。若把换行计入哈希，用户敲个回车就会击穿缓存。
	lines := strings.Split(s, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if t := strings.TrimSpace(line); t != "" {
			kept = append(kept, t)
		}
	}
	s = strings.Join(kept, " ")

	s = multiSpaceRe.ReplaceAllString(s, " ")
	s = dropCJKSpaces(s)

	return strings.TrimSpace(s)
}

// isCJK 判断是否为中日韩字符
func isCJK(r rune) bool {
	return r >= 0x4E00 && r <= 0x9FFF
}

// isPunct 判断是否为归一化后可能出现的标点
func isPunct(r rune) bool {
	switch r {
	case ',', '.', '!', '?', ';', ':', '(', ')', '"', '\'':
		return true
	}
	return false
}

// dropCJKSpaces 去掉不承载信息的空格：汉字之间的空格，以及紧跟标点后的空格。
//
// 中文不以空格分词，「你好 世界」与「你好世界」内容等价；标点本身已是边界，
// 其后的空格纯属排版习惯。英文单词间的空格是词边界，必须保留，因此不做处理。
func dropCJKSpaces(s string) string {
	rs := []rune(s)
	var b strings.Builder
	b.Grow(len(s))
	for i, r := range rs {
		if r == ' ' && i > 0 && i+1 < len(rs) {
			prev, next := rs[i-1], rs[i+1]
			if isCJK(prev) && isCJK(next) {
				continue
			}
			// 标点后紧跟汉字：空格是排版习惯，不是内容
			if isPunct(prev) && isCJK(next) {
				continue
			}
		}
		b.WriteRune(r)
	}
	return b.String()
}

// NormHash 返回归一化后正文的 sha256 十六进制摘要，作为缓存 key。
// 用 sha256 而非 md5：md5 已不适合做新增代码的哈希选型。
func NormHash(parts ...string) string {
	h := sha256.New()
	for i, p := range parts {
		if i > 0 {
			h.Write([]byte{0})
		}
		h.Write([]byte(Normalize(p)))
	}
	return hex.EncodeToString(h.Sum(nil))
}
