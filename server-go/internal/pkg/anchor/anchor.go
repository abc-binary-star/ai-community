// Package anchor 负责帖子正文的段落级锚点解析。
//
// 它是「段落想法/批注」功能的定位地基：把帖子 Markdown 解析成可批注段落的
// 纯文本列表，并提供按降级阶梯（L1→L4）定位一段引用文字的能力。口径与前端
// packages/web/components/markdown-renderer.tsx 的 data-block 标注严格一致——
// p、h1~h6、li、blockquote 参与批注，pre、code 跳过；这是作者编辑后锚点能否
// 可靠重定位的最大工程风险，任何口径漂移都会导致大面积失配。
package anchor

import (
	"bytes"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/digest"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"golang.org/x/net/html"
)

// Paragraph 是帖子正文中一个可批注块级单元的纯文本快照。
type Paragraph struct {
	// Tag 为块级元素标签：p / h1~h6 / li / blockquote。
	Tag string
	// Text 为块子树内的可见纯文本（跳过 pre/code），已 trim。
	// 口径对齐前端 blockText：收集块内全部文本节点，跳过代码。
	Text string
}

// Selector 是 W3C Web Annotation Data Model 的 TextQuoteSelector 精简形态，
// 专为「目标文档会变」的定位设计：Exact 为引用文字，Prefix/Suffix 提供前后文消歧。
type Selector struct {
	Exact  string
	Prefix string
	Suffix string
}

// Level 定位命中的层级，数值越小越精确。LevelNone 表示未命中，应降级为 orphaned。
type Level int

const (
	LevelNone Level = iota // 未命中
	LevelL1                // 原位命中：段落快照一致且引用文字直接命中
	LevelL2                // 段落内重找：快照段落内归一化搜索命中
	LevelL3                // 全文唯一匹配：前后文消歧后唯一命中
	LevelL4                // 保守模糊：归一化全文唯一命中
)

// Location 定位结果。
type Location struct {
	ParagraphIndex int
	StartOffset    int // 段落 Text 内的字符（rune）偏移
	EndOffset      int
	Level          Level
}

var engine = goldmark.New(goldmark.WithExtensions(extension.GFM))

// markdownToHTML 将 Markdown 渲染为 HTML，用于后续按块级标签走查。
func markdownToHTML(markdown string) string {
	var buf bytes.Buffer
	if err := engine.Convert([]byte(markdown), &buf); err != nil {
		return markdown
	}
	return buf.String()
}

var blockTags = map[string]bool{
	"p": true, "h1": true, "h2": true, "h3": true, "h4": true,
	"h5": true, "h6": true, "li": true, "blockquote": true,
}

var codeTags = map[string]bool{
	"pre": true, "code": true,
}

// subtreeText 收集元素子树内的全部文本节点，跳过 pre/code 后代，
// 与前端 highlight-dom.ts 的 blockText 口径一致。
func subtreeText(el *html.Node) string {
	var b strings.Builder
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && codeTags[n.Data] {
			return
		}
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	for c := el.FirstChild; c != nil; c = c.NextSibling {
		walk(c)
	}
	return b.String()
}

// ExtractParagraphs 将帖子 Markdown 解析为可批注段落的纯文本列表（文档顺序）。
//
// 口径与前端 MarkdownRenderer 的 data-block 标注一致：p、h1~h6、li、blockquote
// 参与；pre、code 跳过。每个块的 Text 为其子树内全部可见文本（跳过代码），
// 与前端 blockText 一致，因此嵌套块（如 blockquote 内的 p、含子列表的 li）
// 会各自出现，外层块的 Text 包含内层文本。
func ExtractParagraphs(markdown string) []Paragraph {
	doc, err := html.Parse(strings.NewReader(markdownToHTML(markdown)))
	if err != nil {
		return nil
	}
	var paras []Paragraph
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && blockTags[n.Data] {
			if t := strings.TrimSpace(subtreeText(n)); t != "" {
				paras = append(paras, Paragraph{Tag: n.Data, Text: t})
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return paras
}

// FindParagraph 按「创建时段落快照」定位当前段落索引。
// 优先归一化精确匹配，其次子串包含（段落快照可能只存了片段）。
func FindParagraph(paras []Paragraph, snapshot string) int {
	if snapshot == "" {
		return -1
	}
	normSnap := digest.Normalize(snapshot)
	for i, p := range paras {
		if normSnap != "" && digest.Normalize(p.Text) == normSnap {
			return i
		}
	}
	// 快照可能是段落前缀片段：归一化后段落包含快照
	if normSnap != "" {
		for i, p := range paras {
			if strings.Contains(digest.Normalize(p.Text), normSnap) {
				return i
			}
		}
	}
	return -1
}

type candidate struct {
	paraIdx int
	offset  int // rune 偏移
}

// findAll 返回 exact 在所有段落中出现的候选位置（rune 偏移）。
func findAll(paras []Paragraph, exact string) []candidate {
	if exact == "" {
		return nil
	}
	var out []candidate
	for i, p := range paras {
		start := 0
		for {
			idx := indexRunes(p.Text, exact, start)
			if idx < 0 {
				break
			}
			out = append(out, candidate{paraIdx: i, offset: idx})
			start = idx + len([]rune(exact))
		}
	}
	return out
}

// indexRunes 在 s 中从 rune 偏移 start 开始查找 sub 的 rune 偏移，未找到返回 -1。
func indexRunes(s, sub string, start int) int {
	rs := []rune(s)
	subr := []rune(sub)
	if start < 0 || start > len(rs) {
		return -1
	}
	for i := start; i+len(subr) <= len(rs); i++ {
		match := true
		for j := range subr {
			if rs[i+j] != subr[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

// contextMatch 校验候选位置的前后文是否与 selector 的 prefix/suffix 吻合。
func contextMatch(p Paragraph, offset int, sel Selector) bool {
	rs := []rune(p.Text)
	exactR := []rune(sel.Exact)
	end := offset + len(exactR)
	if sel.Prefix != "" {
		preR := []rune(sel.Prefix)
		want := strings.TrimSpace(sel.Prefix)
		_ = preR
		// 取候选前的等长文本比较（去首尾空白后子串包含即可，容忍漂移）
		look := endOf(rs, offset, len([]rune(want))+4)
		if !strings.Contains(strings.TrimSpace(string(look)), want) && !strings.Contains(want, strings.TrimSpace(string(look))) {
			return false
		}
	}
	if sel.Suffix != "" {
		want := strings.TrimSpace(sel.Suffix)
		look := startOf(rs, end, len([]rune(want))+4)
		if !strings.Contains(strings.TrimSpace(string(look)), want) && !strings.Contains(want, strings.TrimSpace(string(look))) {
			return false
		}
	}
	return true
}

func endOf(rs []rune, upTo, n int) []rune {
	start := upTo - n
	if start < 0 {
		start = 0
	}
	if start > upTo {
		start = upTo
	}
	return rs[start:upTo]
}

func startOf(rs []rune, from, n int) []rune {
	end := from + n
	if end > len(rs) {
		end = len(rs)
	}
	if from > end {
		from = end
	}
	return rs[from:end]
}

// Locate 在段落列表中按 L1→L4 降级阶梯定位 selector。
// snapshot 为创建时保存的段落文本快照（可为空）。未命中返回 nil, LevelNone。
func Locate(paras []Paragraph, sel Selector, snapshot string) (*Location, Level) {
	if sel.Exact == "" {
		return nil, LevelNone
	}
	exactR := []rune(sel.Exact)

	// L1/L2：先在快照段落内查找
	if pi := FindParagraph(paras, snapshot); pi >= 0 {
		p := paras[pi]
		if idx := indexRunes(p.Text, sel.Exact, 0); idx >= 0 {
			return &Location{ParagraphIndex: pi, StartOffset: idx, EndOffset: idx + len(exactR), Level: LevelL1}, LevelL1
		}
		// L2：段落内归一化搜索（容忍全半角/空白漂移）
		if idx := normIndex(p.Text, sel.Exact); idx >= 0 {
			return &Location{ParagraphIndex: pi, StartOffset: idx, EndOffset: idx + len(exactR), Level: LevelL2}, LevelL2
		}
	}

	// L3：全文唯一匹配，前后文消歧
	cands := findAll(paras, sel.Exact)
	if len(cands) == 1 {
		c := cands[0]
		return &Location{ParagraphIndex: c.paraIdx, StartOffset: c.offset, EndOffset: c.offset + len(exactR), Level: LevelL3}, LevelL3
	}
	if len(cands) > 1 && (sel.Prefix != "" || sel.Suffix != "") {
		var filtered []candidate
		for _, c := range cands {
			if contextMatch(paras[c.paraIdx], c.offset, sel) {
				filtered = append(filtered, c)
			}
		}
		if len(filtered) == 1 {
			c := filtered[0]
			return &Location{ParagraphIndex: c.paraIdx, StartOffset: c.offset, EndOffset: c.offset + len(exactR), Level: LevelL3}, LevelL3
		}
	}

	// L4：归一化全文唯一命中（保守模糊，不跨多段落采纳）
	var normHits []candidate
	for i, p := range paras {
		if idx := normIndex(p.Text, sel.Exact); idx >= 0 {
			normHits = append(normHits, candidate{paraIdx: i, offset: idx})
		}
	}
	if len(normHits) == 1 {
		c := normHits[0]
		return &Location{ParagraphIndex: c.paraIdx, StartOffset: c.offset, EndOffset: c.offset + len(exactR), Level: LevelL4}, LevelL4
	}

	return nil, LevelNone
}

// normIndex 在 s 中按归一化文本查找 sub 的 rune 偏移，未找到返回 -1。
// 用于容忍全半角标点、CJK 间空格、强调符号等非内容差异。
func normIndex(s, sub string) int {
	ns := digest.Normalize(s)
	nsub := digest.Normalize(sub)
	if nsub == "" {
		return -1
	}
	// 归一化后长度会变，无法直接换算偏移；这里仅判断是否包含，
	// 命中时偏移回填为 0（调用方对 L2/L4 的偏移仅作占位，前端渲染时按 exact 重算）。
	if strings.Contains(ns, nsub) {
		return 0
	}
	return -1
}
