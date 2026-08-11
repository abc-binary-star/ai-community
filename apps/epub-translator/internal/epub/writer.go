package epub

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// Writer EPUB 写回器：将翻译后的章节内容重新打包为 EPUB
type Writer struct{}

// NewWriter 创建写回器
func NewWriter() *Writer {
	return &Writer{}
}

// WriteOptions 写回选项
type WriteOptions struct {
	OutputPath   string
	Book         *Book
	// TranslatedChapters 章节ID -> 翻译后的 HTML 内容
	TranslatedChapters map[string]string
	// TranslatedTitle 可选的中文书名
	TranslatedTitle string
}

// Write 将翻译后的内容写回 EPUB 文件
func (w *Writer) Write(opts *WriteOptions) error {
	// 读取原始 EPUB 文件以保留未修改的资源
	originalData, err := readFileImpl(opts.OutputPath + ".orig")
	if err != nil {
		// 如果没有原始文件备份，则从 Book 重新构建
		return w.buildFromScratch(opts)
	}

	reader, err := zip.NewReader(bytes.NewReader(originalData), int64(len(originalData)))
	if err != nil {
		return fmt.Errorf("打开原始 EPUB 失败: %w", err)
	}

	outFile, err := os.Create(opts.OutputPath)
	if err != nil {
		return fmt.Errorf("创建输出文件失败: %w", err)
	}
	defer outFile.Close()

	zipWriter := zip.NewWriter(outFile)
	defer zipWriter.Close()

	// 复制所有文件，替换被翻译的章节
	for _, f := range reader.File {
		data, err := readZipFile(reader, f.Name)
		if err != nil {
			logger.L().Warnf("跳过文件 %s: %v", f.Name, err)
			continue
		}

		// 检查是否需要替换为翻译内容
		content := data
		for _, ch := range opts.Book.Chapters {
			if normalizePath(ch.Href) == normalizePath(f.Name) {
				if translated, ok := opts.TranslatedChapters[ch.ID]; ok {
					content = []byte(translated)
					logger.L().Debugf("替换章节 %s 为翻译内容", f.Name)
				}
				break
			}
		}

		// 替换 OPF 中的标题
		if strings.HasSuffix(f.Name, ".opf") && opts.TranslatedTitle != "" {
			content = w.replaceTitleInOPF(content, opts.TranslatedTitle)
		}

		if err := writeZipFile(zipWriter, f.Name, content); err != nil {
			return fmt.Errorf("写入文件 %s 失败: %w", f.Name, err)
		}
	}

	logger.L().Infof("EPUB 写回完成: %s", opts.OutputPath)
	return nil
}

// buildFromScratch 从解析的 Book 结构重新构建 EPUB
func (w *Writer) buildFromScratch(opts *WriteOptions) error {
	outFile, err := os.Create(opts.OutputPath)
	if err != nil {
		return fmt.Errorf("创建输出文件失败: %w", err)
	}
	defer outFile.Close()

	zipWriter := zip.NewWriter(outFile)
	defer zipWriter.Close()

	// 1. mimetype（必须为第一个文件且不压缩）
	mimeWriter, err := zipWriter.Create("mimetype")
	if err != nil {
		return err
	}
	if _, err := mimeWriter.Write([]byte("application/epub+zip")); err != nil {
		return err
	}

	// 2. container.xml
	containerXML := `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
	if err := writeZipFile(zipWriter, "META-INF/container.xml", []byte(containerXML)); err != nil {
		return err
	}

	// 3. OPF
	title := opts.Book.Title
	if opts.TranslatedTitle != "" {
		title = opts.TranslatedTitle
	}
	opfContent := w.buildOPF(opts.Book, title)
	if err := writeZipFile(zipWriter, "OEBPS/content.opf", []byte(opfContent)); err != nil {
		return err
	}

	// 4. 章节内容
	for _, ch := range opts.Book.Chapters {
		content := ch.HTMLContent
		if translated, ok := opts.TranslatedChapters[ch.ID]; ok {
			content = translated
		}
		if err := writeZipFile(zipWriter, ch.Href, []byte(content)); err != nil {
			return err
		}
	}

	// 5. 静态资源
	for _, res := range opts.Book.Resources {
		if err := writeZipFile(zipWriter, res.Href, res.Data); err != nil {
			logger.L().Warnf("写入资源 %s 失败: %v", res.Href, err)
		}
	}

	logger.L().Infof("EPUB 从零构建完成: %s", opts.OutputPath)
	return nil
}

func (w *Writer) replaceTitleInOPF(data []byte, newTitle string) []byte {
	content := string(data)
	// 简单替换 <dc:title> 标签内容
	startTag := "<dc:title"
	endTag := "</dc:title>"
	startIdx := strings.Index(content, startTag)
	if startIdx == -1 {
		return data
	}
	contentEnd := strings.Index(content[startIdx:], ">")
	if contentEnd == -1 {
		return data
	}
	actualStart := startIdx + contentEnd + 1
	endIdx := strings.Index(content[actualStart:], endTag)
	if endIdx == -1 {
		return data
	}
	result := content[:actualStart] + newTitle + content[actualStart+endIdx:]
	return []byte(result)
}

func (w *Writer) buildOPF(book *Book, title string) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">`)
	sb.WriteString(book.Identifier)
	sb.WriteString(`</dc:identifier>
    <dc:title>`)
	sb.WriteString(escapeXML(title))
	sb.WriteString(`</dc:title>
    <dc:creator>`)
	sb.WriteString(escapeXML(book.Author))
	sb.WriteString(`</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
`)
	for _, ch := range book.Chapters {
		fmt.Fprintf(&sb, `    <item id="%s" href="%s" media-type="application/xhtml+xml"/>`+"\n", ch.ID, filepath.Base(ch.Href))
	}
	sb.WriteString(`  </manifest>
  <spine>
`)
	for _, ch := range book.Chapters {
		fmt.Fprintf(&sb, `    <itemref idref="%s"/>`+"\n", ch.ID)
	}
	sb.WriteString(`  </spine>
</package>`)
	return sb.String()
}

func writeZipFile(w *zip.Writer, name string, data []byte) error {
	writer, err := w.Create(name)
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// readFileImpl 可被测试替换
var readFileImpl = func(path string) ([]byte, error) {
	return os.ReadFile(path)
}
