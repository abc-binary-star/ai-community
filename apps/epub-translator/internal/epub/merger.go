package epub

import (
	"bytes"
	"fmt"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// MergeTranslations 将翻译后的块内容按 BlockStart/BlockEnd 替换回章节 HTML。
// chunks 必须与该章节分块时的顺序一致，translated 与 chunks 一一对应（失败的块传原片段）。
//
// 只重渲染 <body> 内部，文档头尾（XML 声明/DOCTYPE/html 标签/head）原样保留，
// 避免 html.Render 规范化带来的格式失真。
func MergeTranslations(originalHTML string, chunks []TextChunk, translated []string) (string, error) {
	prefix, bodyInner, suffix, ok := splitBody(originalHTML)
	if !ok {
		return originalHTML, nil
	}

	doc, err := html.Parse(strings.NewReader(bodyInner))
	if err != nil {
		return "", fmt.Errorf("解析章节 body 失败: %w", err)
	}

	bodyNode := findBody(doc)
	if bodyNode == nil {
		return originalHTML, nil
	}

	var blockNodes []*html.Node
	collectBlockNodes(bodyNode, &blockNodes)

	for i, ch := range chunks {
		if i >= len(translated) || translated[i] == "" {
			continue
		}
		if ch.BlockStart >= 0 && ch.BlockEnd < len(blockNodes) && ch.BlockStart <= ch.BlockEnd {
			replaceBlockRange(blockNodes, ch.BlockStart, ch.BlockEnd, translated[i])
		}
	}

	var buf bytes.Buffer
	for child := bodyNode.FirstChild; child != nil; child = child.NextSibling {
		if err := html.Render(&buf, child); err != nil {
			return "", fmt.Errorf("渲染章节 body 失败: %w", err)
		}
	}
	return prefix + buf.String() + suffix, nil
}

// splitBody 将章节 HTML 拆为 <body> 之前的 prefix、内部内容、</body> 之后的后缀
func splitBody(htmlStr string) (prefix, bodyInner, suffix string, ok bool) {
	lower := strings.ToLower(htmlStr)
	bodyStart := strings.Index(lower, "<body")
	if bodyStart == -1 {
		return "", "", "", false
	}
	openEndRel := strings.Index(htmlStr[bodyStart:], ">")
	if openEndRel == -1 {
		return "", "", "", false
	}
	bodyOpenEnd := bodyStart + openEndRel + 1

	closeStart := strings.LastIndex(lower, "</body>")
	if closeStart == -1 {
		closeStart = len(htmlStr)
	}

	return htmlStr[:bodyOpenEnd], htmlStr[bodyOpenEnd:closeStart], htmlStr[closeStart:], true
}

// findBody 在解析后的文档树中找到 <body> 节点
func findBody(n *html.Node) *html.Node {
	if n.Type == html.ElementNode && n.DataAtom == atom.Body {
		return n
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		if found := findBody(child); found != nil {
			return found
		}
	}
	return nil
}

// collectBlockNodes 收集可翻译文本块节点，遍历顺序与 Chunker 的 extractTextBlocks 一致
func collectBlockNodes(n *html.Node, out *[]*html.Node) {
	if n.Type == html.ElementNode && translatableTags[n.Data] {
		text := strings.TrimSpace(extractText(n))
		if text != "" {
			*out = append(*out, n)
			return
		}
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		collectBlockNodes(child, out)
	}
}

// replaceBlockRange 用翻译后的 HTML 替换 [start, end] 闭区间内的原始块节点
func replaceBlockRange(blockNodes []*html.Node, start, end int, translatedHTML string) {
	first := blockNodes[start]
	parent := first.Parent
	if parent == nil {
		return
	}

	// 1. 在 first 节点前依次插入翻译后的节点，保持顺序
	fragments, err := html.ParseFragment(strings.NewReader(translatedHTML), &html.Node{
		Type: html.ElementNode, Data: "body", DataAtom: atom.Body,
	})
	if err != nil {
		return
	}
	for _, frag := range fragments {
		parent.InsertBefore(frag, first)
	}

	// 2. 移除被替换的原始块节点
	for i := start; i <= end; i++ {
		parent.RemoveChild(blockNodes[i])
	}
}
