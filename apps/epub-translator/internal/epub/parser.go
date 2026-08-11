package epub

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// Parser EPUB 解析器
type Parser struct{}

// NewParser 创建解析器
func NewParser() *Parser {
	return &Parser{}
}

// Parse 从文件路径解析 EPUB
func (p *Parser) Parse(path string) (*Book, error) {
	data, err := readFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取 EPUB 文件失败: %w", err)
	}
	return p.ParseBytes(data)
}

// ParseBytes 从字节数据解析 EPUB
func (p *Parser) ParseBytes(data []byte) (*Book, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("打开 EPUB zip 失败: %w", err)
	}

	book := &Book{}

	// 1. 定位 container.xml，找到 OPF 路径
	opfPath, err := findOPFPath(reader)
	if err != nil {
		return nil, err
	}
	book.MetaPath = opfPath

	// 2. 解析 OPF，提取元数据与 spine（章节顺序）
	opfData, err := readZipFile(reader, opfPath)
	if err != nil {
		return nil, fmt.Errorf("读取 OPF 失败: %w", err)
	}

	opf, err := parseOPF(opfData)
	if err != nil {
		return nil, fmt.Errorf("解析 OPF 失败: %w", err)
	}

	book.Title = opf.Metadata.Title
	book.Author = opf.Metadata.Creator
	book.Language = opf.Metadata.Language
	book.Publisher = opf.Metadata.Publisher
	book.Description = opf.Metadata.Description
	book.Identifier = opf.Metadata.Identifier

	// 构建 guide/landmarks 映射（href -> 前置页类型）
	baseDir := filepath.Dir(opfPath)
	book.Guide = buildGuideMap(opf, baseDir)

	// 3. 按 spine 顺序读取章节内容
	for i, itemref := range opf.Spine.Itemrefs {
		manifestItem := findManifestItem(opf.Manifest, itemref.IDRef)
		if manifestItem == nil {
			continue
		}
		href := joinPath(baseDir, manifestItem.Href)
		htmlData, err := readZipFile(reader, href)
		if err != nil {
			logger.L().Warnf("读取章节 %s 失败: %v", href, err)
			continue
		}

		title := extractTitleFromHTML(htmlData)
		chapter := Chapter{
			ID:          manifestItem.ID,
			Href:        href,
			Title:       title,
			HTMLContent: string(htmlData),
			Order:       i,
			Kind:        classifyChapterKind(book.Guide, href),
		}
		book.Chapters = append(book.Chapters, chapter)
	}

	// 4. 收集静态资源
	for _, item := range opf.Manifest.Items {
		if isStaticResource(item.MediaType) {
			href := joinPath(baseDir, item.Href)
			data, err := readZipFile(reader, href)
			if err == nil {
				book.Resources = append(book.Resources, Resource{
					Href:      href,
					MediaType: item.MediaType,
					Data:      data,
				})
			}
		}
	}

	logger.L().Infof("EPUB 解析完成: 书名=%s, 作者=%s, 章节数=%d, 资源数=%d",
		book.Title, book.Author, len(book.Chapters), len(book.Resources))

	return book, nil
}

// ===== OPF 解析结构 =====

type opfDocument struct {
	XMLName   xml.Name    `xml:"package"`
	Version   string      `xml:"version,attr"`
	Metadata  opfMetadata `xml:"metadata"`
	Manifest  opfManifest `xml:"manifest"`
	Spine     opfSpine    `xml:"spine"`
	Guide     opfGuide    `xml:"guide"`
}

type opfMetadata struct {
	Title       string `xml:"title"`
	Creator     string `xml:"creator"`
	Language    string `xml:"language"`
	Publisher   string `xml:"publisher"`
	Description string `xml:"description"`
	Identifier  string `xml:"identifier"`
}

type opfManifest struct {
	Items []opfItem `xml:"item"`
}

type opfItem struct {
	ID         string `xml:"id,attr"`
	Href       string `xml:"href,attr"`
	MediaType  string `xml:"media-type,attr"`
	Properties string `xml:"properties,attr"`
}

type opfSpine struct {
	Itemrefs []opfItemref `xml:"itemref"`
}

type opfItemref struct {
	IDRef string `xml:"idref,attr"`
}

// opfGuide OPF guide（EPUB2 前置页导航）
type opfGuide struct {
	References []opfReference `xml:"reference"`
}

type opfReference struct {
	Type  string `xml:"type,attr"`
	Href  string `xml:"href,attr"`
	Title string `xml:"title,attr"`
}

// buildGuideMap 构建 href(归一化，含 OPF 目录前缀) -> guide 类型 的映射
func buildGuideMap(opf *opfDocument, baseDir string) map[string]string {
	m := make(map[string]string)
	for _, ref := range opf.Guide.References {
		if ref.Type == "" || ref.Href == "" {
			continue
		}
		// 去掉锚点（#id），并拼上 OPF 目录前缀与章节路径保持一致
		href := strings.SplitN(ref.Href, "#", 2)[0]
		m[normalizePath(joinPath(baseDir, href))] = ref.Type
	}
	return m
}

// classifyChapterKind 判断章节类型（前置页 / 正文）
func classifyChapterKind(guide map[string]string, href string) string {
	if len(guide) == 0 {
		return ""
	}
	return guide[normalizePath(href)]
}

func parseOPF(data []byte) (*opfDocument, error) {
	var doc opfDocument
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

func findManifestItem(manifest opfManifest, id string) *opfItem {
	for i := range manifest.Items {
		if manifest.Items[i].ID == id {
			return &manifest.Items[i]
		}
	}
	return nil
}

// ===== 辅助函数 =====

func findOPFPath(reader *zip.Reader) (string, error) {
	containerData, err := readZipFile(reader, "META-INF/container.xml")
	if err != nil {
		return "", fmt.Errorf("读取 container.xml 失败: %w", err)
	}

	var container struct {
		Rootfiles struct {
			Rootfile struct {
				FullPath string `xml:"full-path,attr"`
			} `xml:"rootfile"`
		} `xml:"rootfiles"`
	}
	if err := xml.Unmarshal(containerData, &container); err != nil {
		return "", fmt.Errorf("解析 container.xml 失败: %w", err)
	}
	return container.Rootfiles.Rootfile.FullPath, nil
}

func readZipFile(reader *zip.Reader, name string) ([]byte, error) {
	for _, f := range reader.File {
		if normalizePath(f.Name) == normalizePath(name) {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return io.ReadAll(rc)
		}
	}
	return nil, fmt.Errorf("文件 %s 不存在于 EPUB 中", name)
}

func readFile(path string) ([]byte, error) {
	return readFileImpl(path)
}

func normalizePath(p string) string {
	return strings.ReplaceAll(filepath.Clean(p), "\\", "/")
}

func joinPath(base, href string) string {
	return filepath.ToSlash(filepath.Join(base, href))
}

func isStaticResource(mediaType string) bool {
	switch {
	case strings.HasPrefix(mediaType, "image/"),
		strings.HasPrefix(mediaType, "font/"),
		mediaType == "application/x-font-ttf",
		mediaType == "application/x-font-otf",
		mediaType == "text/css",
		mediaType == "application/vnd.ms-opentype",
		mediaType == "application/font-woff",
		mediaType == "application/font-woff2":
		return true
	}
	return false
}

func extractTitleFromHTML(htmlData []byte) string {
	// 简单从 <title> 或 <h1> 提取标题
	content := string(htmlData)
	if title := extractBetween(content, "<title>", "</title>"); title != "" {
		return strings.TrimSpace(title)
	}
	if h1 := extractBetween(content, "<h1", "</h1>"); h1 != "" {
		// 去掉 <h1 ...> 的属性部分
		if idx := strings.Index(h1, ">"); idx != -1 {
			return strings.TrimSpace(h1[idx+1:])
		}
	}
	return ""
}

func extractBetween(s, start, end string) string {
	startIdx := strings.Index(strings.ToLower(s), strings.ToLower(start))
	if startIdx == -1 {
		return ""
	}
	startIdx += len(start)
	endIdx := strings.Index(strings.ToLower(s[startIdx:]), strings.ToLower(end))
	if endIdx == -1 {
		return ""
	}
	return s[startIdx : startIdx+endIdx]
}
