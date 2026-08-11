package epub

// Book 解析后的 EPUB 书籍
type Book struct {
	Title       string    // 书名
	Author      string    // 作者
	Language    string    // 语言
	Publisher   string    // 出版社
	Description string    // 简介
	Identifier  string    // ISBN/UUID
	Chapters    []Chapter // 章节列表
	Resources   []Resource // 静态资源（图片/CSS/字体）
	MetaPath    string    // OPF 文件路径
	Guide       map[string]string // guide 映射：href -> 前置页类型（cover/titlepage/colophon/toc）
}

// Chapter EPUB 章节
type Chapter struct {
	ID         string // 章节 ID（OPF 中的 idref）
	Href       string // 文件路径（如 OEBPS/chapter1.xhtml）
	Title      string // 章节标题（从 TOC 或 <h1> 提取）
	HTMLContent string // 原始 XHTML 内容
	Order      int    // 在 spine 中的顺序
	Kind       string // 章节类型："" 正文 | cover | titlepage | colophon | toc 前置页
}

// Resource 静态资源
type Resource struct {
	Href      string // 文件路径
	MediaType string // MIME 类型
	Data      []byte // 二进制内容
}

// TextChunk 可翻译的文本块
type TextChunk struct {
	Index        int    // 块在章节中的序号
	ChapterID    string // 所属章节 ID
	ChapterTitle string // 章节标题
	HTMLFragment string // 原始 HTML 片段（仅文本节点，保留内联标签）
	PlainText    string // 纯文本（用于 Token 计数与上下文）
	ContextLeft  string // 前置上下文（上一块末尾）
	ContextRight string // 后置上下文（下一块开头）
	TokenCount   int    // 估算 Token 数
	BlockStart   int    // 覆盖的原始文本块起始序号
	BlockEnd     int    // 覆盖的原始文本块结束序号（闭区间）
}
