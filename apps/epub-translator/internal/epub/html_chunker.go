package epub

import (
	"fmt"
	"strings"

	"golang.org/x/net/html"
)

// Chunker HTML 文本分块器
// 支持两种切分：
//   - ChunkChapter：按 Token 预算聚合（V1 兼容，流水线抽样/QA 用）
//   - CutSections：按语义段落节切分（M2 精读模式，默认每节约 500 字，特殊块保护）
type Chunker struct {
	MaxTokens    int
	ContextLeft  int
	ContextRight int
	TargetChars  int // 段落节目标字数（M2，0 时默认 500）
}

// NewChunker 创建分块器
func NewChunker(maxTokens, contextLeft, contextRight int) *Chunker {
	return &Chunker{
		MaxTokens:    maxTokens,
		ContextLeft:  contextLeft,
		ContextRight: contextRight,
	}
}

// NewSectionChunker 创建段落节切分器（M2 精读模式）
func NewSectionChunker(targetChars int) *Chunker {
	return &Chunker{TargetChars: targetChars}
}

// ChunkChapter 将章节 HTML 切分为可翻译的文本块（V1 Token 预算模式）
func (c *Chunker) ChunkChapter(chapter Chapter) ([]TextChunk, error) {
	doc, err := html.Parse(strings.NewReader(chapter.HTMLContent))
	if err != nil {
		return nil, fmt.Errorf("解析 HTML 失败: %w", err)
	}

	// 提取可翻译的文本块（段落、标题、列表项）
	var blocks []htmlBlock
	extractTextBlocks(doc, &blocks)

	// 按 Token 预算聚合文本块
	var chunks []TextChunk
	var currentBlocks []htmlBlock
	blockStart := 0
	currentTokens := 0

	for _, block := range blocks {
		blockTokens := estimateTokens(block.text)
		if currentTokens+blockTokens > c.MaxTokens && len(currentBlocks) > 0 {
			chunks = append(chunks, buildChunk(chapter, blocks, blockStart, len(currentBlocks)))
			blockStart += len(currentBlocks)
			currentBlocks = nil
			currentTokens = 0
		}
		currentBlocks = append(currentBlocks, block)
		currentTokens += blockTokens
	}
	if len(currentBlocks) > 0 {
		chunks = append(chunks, buildChunk(chapter, blocks, blockStart, len(currentBlocks)))
	}

	// 设置块序号与上下文窗口
	for i := range chunks {
		chunks[i].Index = i
	}
	c.setContext(chunks)

	return chunks, nil
}

// CutSections 将章节切分为语义段落节（M2 精读模式）
// 规则：
//   - 普通段落/标题/列表按目标字数聚合（默认 500 字）
//   - 特殊块（对话/诗歌/引用/表格/其他）保持完整不拆散，不与普通段落混排；
//     同类特殊块可连续聚合为一个节（如一段对话往来）
func (c *Chunker) CutSections(chapter Chapter) ([]SectionPlan, error) {
	doc, err := html.Parse(strings.NewReader(chapter.HTMLContent))
	if err != nil {
		return nil, fmt.Errorf("解析 HTML 失败: %w", err)
	}

	var blocks []htmlBlock
	extractTextBlocks(doc, &blocks)
	if len(blocks) == 0 {
		return nil, fmt.Errorf("章节 %s 无可翻译文本块", chapter.Title)
	}

	budget := c.TargetChars
	if budget <= 0 {
		budget = 500
	}

	var sections []SectionPlan
	var current []htmlBlock
	currentKind := "" // 当前节的特殊类型（"" = 普通聚合节）
	currentChars := 0
	blockStart := 0

	flush := func() {
		if len(current) == 0 {
			return
		}
		kind := currentKind
		if kind == "" {
			kind = current[0].kind
		}
		var htmlParts, textParts []string
		chars := 0
		for _, b := range current {
			htmlParts = append(htmlParts, b.html)
			textParts = append(textParts, b.text)
			chars += len(b.text)
		}
		sections = append(sections, SectionPlan{
			Index:        len(sections),
			ChapterID:    chapter.ID,
			ChapterTitle: chapter.Title,
			Kind:         kind,
			HTMLFragment: strings.Join(htmlParts, "\n"),
			PlainText:    strings.Join(textParts, "\n"),
			CharCount:    chars,
			BlockStart:   blockStart,
			BlockEnd:     blockStart + len(current) - 1,
		})
		blockStart += len(current)
		current = nil
		currentKind = ""
		currentChars = 0
	}

	for _, block := range blocks {
		if block.special {
			// 特殊块：不与普通段落混排；与当前节不同类时换新节
			if len(current) > 0 && (currentKind == "" || currentKind != block.kind) {
				flush()
			}
			current = append(current, block)
			currentKind = block.kind
			currentChars += len(block.text)
		} else {
			// 普通块：预算内聚合
			if len(current) > 0 && currentKind != "" {
				flush()
			}
			if len(current) > 0 && currentChars+len(block.text) > budget {
				flush()
			}
			current = append(current, block)
			currentKind = ""
			currentChars += len(block.text)
		}
	}
	flush()

	return sections, nil
}

// buildChunk 基于 blocks 的 [start, start+count) 范围构建一个 TextChunk
func buildChunk(chapter Chapter, blocks []htmlBlock, start, count int) TextChunk {
	var htmlParts, textParts []string
	for _, b := range blocks[start : start+count] {
		htmlParts = append(htmlParts, b.html)
		textParts = append(textParts, b.text)
	}
	tokens := 0
	for _, b := range blocks[start : start+count] {
		tokens += estimateTokens(b.text)
	}
	return TextChunk{
		Index:        0, // 由调用方设置
		ChapterID:    chapter.ID,
		ChapterTitle: chapter.Title,
		HTMLFragment: strings.Join(htmlParts, "\n"),
		PlainText:    strings.Join(textParts, "\n"),
		TokenCount:   tokens,
		BlockStart:   start,
		BlockEnd:     start + count - 1,
	}
}

// setContext 为每个 Chunk 设置前后上下文
func (c *Chunker) setContext(chunks []TextChunk) {
	for i := range chunks {
		if i > 0 {
			prevText := chunks[i-1].PlainText
			if len(prevText) > c.ContextLeft {
				chunks[i].ContextLeft = prevText[len(prevText)-c.ContextLeft:]
			} else {
				chunks[i].ContextLeft = prevText
			}
		}
		if i < len(chunks)-1 {
			nextText := chunks[i+1].PlainText
			if len(nextText) > c.ContextRight {
				chunks[i].ContextRight = nextText[:c.ContextRight]
			} else {
				chunks[i].ContextRight = nextText
			}
		}
	}
}

// htmlBlock 可翻译的 HTML 文本块
type htmlBlock struct {
	html    string // 原始 HTML 片段
	text    string // 纯文本
	kind    string // 块类型：paragraph/heading/list/dialogue/poem/quote/table/other
	special bool   // 是否特殊块（保持完整不拆散、不与普通段落混排）
}

// translatableTags 可翻译标签
var translatableTags = map[string]bool{
	"p":          true,
	"h1":         true,
	"h2":         true,
	"h3":         true,
	"h4":         true,
	"h5":         true,
	"h6":         true,
	"li":         true,
	"blockquote": true,
	"td":         true,
	"th":         true,
	"caption":    true,
	"figcaption": true,
	"dt":         true,
	"dd":         true,
}

func extractTextBlocks(n *html.Node, blocks *[]htmlBlock) {
	if n.Type == html.ElementNode && translatableTags[n.Data] {
		text := extractText(n)
		text = strings.TrimSpace(text)
		if text != "" {
			var buf strings.Builder
			renderNode(&buf, n)
			rendered := buf.String()
			kind, special := classifyBlock(n.Data, rendered, text)
			*blocks = append(*blocks, htmlBlock{
				html:    rendered,
				text:    text,
				kind:    kind,
				special: special,
			})
			// 不再递归子节点（已包含整块）
			return
		}
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		extractTextBlocks(child, blocks)
	}
}

// classifyBlock 识别块的语义类型（M2 段落节切分的特殊块保护依据）
func classifyBlock(tag, rendered, text string) (kind string, special bool) {
	switch tag {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		return "heading", false
	case "blockquote":
		return "quote", true
	case "pre", "dt", "dd":
		return "other", true
	case "td", "th", "caption", "figcaption":
		return "table", true
	case "li":
		return "list", false
	case "p":
		if isDialogue(text) {
			return "dialogue", true
		}
		if isPoem(rendered) {
			return "poem", true
		}
		return "paragraph", false
	}
	return "paragraph", false
}

// isDialogue 判断段落是否为对话：引号开头，或引语归属（said / 说/道/问…）
func isDialogue(text string) bool {
	t := strings.TrimSpace(text)
	if t == "" {
		return false
	}
	// 引号开头（中英文直引/弯引/书名号）
	for _, q := range []string{"\"", "'", "“", "‘", "«", "《"} {
		if strings.HasPrefix(t, q) {
			return true
		}
	}
	// 引语归属：文本含引号且出现说话动词（said/asked… / 说/道/问…）
	if strings.ContainsAny(t, "\"”") || strings.ContainsAny(t, "'‘") {
		lower := strings.ToLower(t)
		for _, v := range []string{" said", " asked", " replied", " whispered", " cried", " shouted", " murmured", " told", " answered", " says", " saying", "says", "asks", "replies"} {
			if strings.Contains(lower, v) {
				return true
			}
		}
		for _, v := range []string{"说", "道", "问", "答", "喊", "叫", "骂", "应", "笑"} {
			if strings.Contains(t, v) {
				return true
			}
		}
	}
	return false
}

// isPoem 判断段落是否为诗歌/歌词：多个 <br> 短行
func isPoem(rendered string) bool {
	return strings.Count(strings.ToLower(rendered), "<br") >= 2
}

func extractText(n *html.Node) string {
	if n.Type == html.TextNode {
		return n.Data
	}
	var sb strings.Builder
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		sb.WriteString(extractText(child))
	}
	return sb.String()
}

func renderNode(buf *strings.Builder, n *html.Node) {
	if n.Type == html.TextNode {
		buf.WriteString(n.Data)
		return
	}
	if n.Type == html.ElementNode {
		buf.WriteString("<")
		buf.WriteString(n.Data)
		for _, attr := range n.Attr {
			buf.WriteString(" ")
			buf.WriteString(attr.Key)
			buf.WriteString("=\"")
			buf.WriteString(attr.Val)
			buf.WriteString("\"")
		}
		buf.WriteString(">")
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		renderNode(buf, child)
	}
	if n.Type == html.ElementNode {
		buf.WriteString("</")
		buf.WriteString(n.Data)
		buf.WriteString(">")
	}
}

// PlainTextOf 提取 HTML 片段的纯文本（用于上下文与 token 估算）
func PlainTextOf(htmlStr string) string {
	doc, err := html.Parse(strings.NewReader(htmlStr))
	if err != nil {
		return ""
	}
	var sb strings.Builder
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			sb.WriteString(n.Data)
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	return strings.TrimSpace(sb.String())
}

// estimateTokens 粗略估算 Token 数（英文 ~4字符/token，中文 ~1.5字符/token）
func estimateTokens(text string) int {
	charCount := len(text)
	// 简单混合估算
	return charCount / 3
}
