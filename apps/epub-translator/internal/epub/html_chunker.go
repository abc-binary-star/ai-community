package epub

import (
	"fmt"
	"strings"

	"golang.org/x/net/html"
)

// Chunker HTML 文本分块器
type Chunker struct {
	MaxTokens     int
	ContextLeft   int
	ContextRight  int
}

// NewChunker 创建分块器
func NewChunker(maxTokens, contextLeft, contextRight int) *Chunker {
	return &Chunker{
		MaxTokens:    maxTokens,
		ContextLeft:  contextLeft,
		ContextRight: contextRight,
	}
}

// ChunkChapter 将章节 HTML 切分为可翻译的文本块
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
	html string // 原始 HTML 片段
	text string // 纯文本
}

// extractTextBlocks 从 DOM 树中提取可翻译的文本块
// 可翻译标签：p, h1-h6, li, blockquote, td, th, caption, figcaption
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
			*blocks = append(*blocks, htmlBlock{
				html: buf.String(),
				text: text,
			})
			// 不再递归子节点（已包含整块）
			return
		}
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		extractTextBlocks(child, blocks)
	}
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

// estimateTokens 粗略估算 Token 数（英文 ~4字符/token，中文 ~1.5字符/token）
func estimateTokens(text string) int {
	charCount := len(text)
	// 简单混合估算
	return charCount / 3
}
