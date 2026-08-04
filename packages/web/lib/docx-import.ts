// 把 .docx 转成 markdown，并把内嵌图片抽成 File 交给上层走延迟上传。
// 本地 Word/WPS 文档复制粘贴时，剪贴板里的图片是 file:// 临时路径，网页无权读取（见 markdown-editor 的 parseRichHtml）；
// 直接读 .docx 是唯一能完整保留全部图片的途径——docx 本质是 zip，图片都在 word/media/ 下。

// 反引号字符，用 charCode 生成，避免在源码里直接出现反引号
// （含反引号的字符串/正则在部分编译链路下会被误当作模板字符串处理，同 lib/markdown-images.ts）
const BT = String.fromCharCode(96)
const FENCE = BT + BT + BT

// 图片占位符：mammoth 转换阶段先写占位符，上层拿到 blob URL 后再替换
const IMG_PLACEHOLDER_PREFIX = '@@DOCX_IMG_'

// 服务端只认这四种（server-go/internal/handler/upload.go 的 allowedImageTypes）。
// Word 里的图表/形状/公式常以 EMF/WMF 矢量格式内嵌，浏览器和服务端都处理不了，只能跳过
const WEB_SAFE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface DocxImage {
  placeholder: string
  file: File
}

export interface DocxImportResult {
  markdown: string
  images: DocxImage[]
  // 无法处理的图片类型（如 EMF/WMF 矢量图），用于提示用户
  skippedTypes: string[]
}

export function isDocxFile(file: File): boolean {
  return file.type === DOCX_MIME || /\.docx$/i.test(file.name)
}

// Word 97-2003 的 .doc 是二进制格式，mammoth 不支持，需提示用户另存为 .docx
export function isLegacyDocFile(file: File): boolean {
  return file.type === 'application/msword' || /\.doc$/i.test(file.name)
}

// 转义正文里的 markdown 元字符，避免文档原文被当成语法解析。
// \u00a0（Word 大量使用的不换行空格）统一成普通空格
function escapeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(new RegExp('[\\\\' + BT + '*_\\[\\]<>]', 'g'), (c) => '\\' + c)
}

// 行首字符（#、>、-、+、数字加点）会触发块级语法，只在行首转义
function escapeLineStart(text: string): string {
  return text.replace(/^(\s*)([#>\-+])/, '$1\\$2').replace(/^(\s*)(\d+)\./, '$1$2\\.')
}

// 行内元素转 markdown：粗体/斜体/删除线/行内代码/链接/图片
function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent || '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = Array.from(el.childNodes).map(serializeInline).join('')

  switch (tag) {
    case 'strong':
    case 'b':
      return inner.trim() ? `**${inner}**` : inner
    case 'em':
    case 'i':
      return inner.trim() ? `*${inner}*` : inner
    case 's':
    case 'strike':
    case 'del':
      return inner.trim() ? `~~${inner}~~` : inner
    case 'code':
      // 代码内不转义，取原始文本
      return BT + (el.textContent || '').replace(/\u00a0/g, ' ') + BT
    case 'br':
      return '\n'
    case 'sup':
      return inner ? `^${inner}^` : ''
    case 'sub':
      return inner ? `~${inner}~` : ''
    case 'a': {
      const href = (el.getAttribute('href') || '').trim()
      // 只放行安全协议，Word 文档里的书签锚点（#_Toc...）无意义，直接取文字
      if (!/^(https?:|mailto:)/i.test(href)) return inner
      return inner.trim() ? `[${inner}](${href})` : href
    }
    case 'img': {
      const src = (el.getAttribute('src') || '').trim()
      if (!src) return ''
      const alt = (el.getAttribute('alt') || '图片').replace(/[[\]]/g, '')
      return `![${alt}](${src})`
    }
    default:
      return inner
  }
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'blockquote', 'pre', 'hr',
])

// 元素内是否含块级后代：没有则可整体当段落处理
function hasBlockChild(el: HTMLElement): boolean {
  return Array.from(el.children).some(
    (c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) || hasBlockChild(c as HTMLElement),
  )
}

// 块级元素转 markdown，返回若干段落（调用方用空行拼接）
function serializeBlock(el: HTMLElement): string[] {
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = inlineOf(el)
      if (!text) return []
      return ['#'.repeat(Number(tag[1])) + ' ' + text.replace(/\n+/g, ' ')]
    }
    case 'p': {
      const text = inlineOf(el)
      if (!text) return []
      // 段内软换行用 markdown 的行尾两空格保留
      return [escapeLineStart(text).replace(/\n/g, '  \n')]
    }
    case 'ul':
    case 'ol':
      return serializeList(el, 0)
    case 'blockquote': {
      const inner = serializeBlocks(el)
      if (inner.length === 0) return []
      return [inner.join('\n\n').split('\n').map((l) => '> ' + l).join('\n')]
    }
    case 'pre': {
      const code = (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+$/, '')
      if (!code) return []
      return [FENCE + '\n' + code + '\n' + FENCE]
    }
    case 'table':
      return serializeTable(el)
    case 'hr':
      return ['---']
    default: {
      if (!hasBlockChild(el)) {
        const text = inlineOf(el)
        return text ? [escapeLineStart(text)] : []
      }
      return serializeBlocks(el)
    }
  }
}

// 取元素的行内 markdown，收敛首尾空白
function inlineOf(el: HTMLElement): string {
  return Array.from(el.childNodes).map(serializeInline).join('').replace(/[ \t]+/g, ' ').trim()
}

// 遍历子节点：块级元素递归，散落的行内节点合并成一个段落
function serializeBlocks(root: HTMLElement): string[] {
  const out: string[] = []
  let pending = ''

  const flush = () => {
    const text = pending.replace(/[ \t]+/g, ' ').trim()
    if (text) out.push(escapeLineStart(text))
    pending = ''
  }

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((child as HTMLElement).tagName.toLowerCase())) {
      flush()
      out.push(...serializeBlock(child as HTMLElement))
    } else if (child.nodeType === Node.ELEMENT_NODE && hasBlockChild(child as HTMLElement)) {
      flush()
      out.push(...serializeBlocks(child as HTMLElement))
    } else {
      pending += serializeInline(child)
    }
  }
  flush()
  return out
}

// 列表转 markdown，支持嵌套（每层缩进两空格）
function serializeList(list: HTMLElement, depth: number): string[] {
  const ordered = list.tagName.toLowerCase() === 'ol'
  const indent = '  '.repeat(depth)
  const lines: string[] = []
  let index = 1

  for (const li of Array.from(list.children)) {
    if (li.tagName.toLowerCase() !== 'li') continue
    const item = li as HTMLElement

    // 先取本项自身文字（跳过嵌套列表），再递归子列表
    const ownNodes = Array.from(item.childNodes).filter(
      (n) => !(n.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((n as HTMLElement).tagName.toLowerCase())),
    )
    const wrapper = item.ownerDocument.createElement('div')
    ownNodes.forEach((n) => wrapper.appendChild(n.cloneNode(true)))
    const text = inlineOf(wrapper).replace(/\n+/g, ' ')

    const marker = ordered ? `${index}. ` : '- '
    lines.push(indent + marker + text)
    index++

    for (const nested of Array.from(item.children)) {
      const nestedTag = nested.tagName.toLowerCase()
      if (nestedTag === 'ul' || nestedTag === 'ol') {
        lines.push(...serializeList(nested as HTMLElement, depth + 1))
      }
    }
  }

  return lines.length > 0 ? [lines.join('\n')] : []
}

// 表格转 GFM 表格。Word 表格常无 <th>，此时把首行当表头
function serializeTable(table: HTMLElement): string[] {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return []

  const cellText = (cell: Element) =>
    inlineOf(cell as HTMLElement).replace(/\n+/g, ' ').replace(/\|/g, '\\|')

  const matrix = rows.map((tr) => Array.from(tr.children)
    .filter((c) => ['td', 'th'].includes(c.tagName.toLowerCase()))
    .map(cellText))

  // matrix 为空时 Math.max(...[]) 会得到 -Infinity，需先兜底成 0
  const width = matrix.length > 0 ? Math.max(...matrix.map((r) => r.length)) : 0
  if (width === 0) return []

  const pad = (row: string[]) => {
    const filled = [...row]
    while (filled.length < width) filled.push('')
    return '| ' + filled.join(' | ') + ' |'
  }

  const lines = [pad(matrix[0]), '| ' + Array(width).fill('---').join(' | ') + ' |']
  for (const row of matrix.slice(1)) lines.push(pad(row))
  return [lines.join('\n')]
}

// 读 .docx 并转成 markdown。图片以占位符留在正文里，配对的 File 放在 images 中，
// 由调用方换成 blob URL（走编辑器既有的延迟上传链路）
export async function convertDocxToMarkdown(file: File): Promise<DocxImportResult> {
  // mammoth 体积约 2MB，动态引入避免拖累首屏。
  // mammoth 是 CommonJS 包（只有具名导出、没有 default），不同打包/interop 下
  // default 可能为 undefined，这里做兼容取值，避免后面读 images 时报 undefined
  const mod = await import('mammoth')
  const mammoth = ((mod as unknown as { default?: unknown }).default ?? mod) as typeof import('mammoth')
  if (typeof mammoth?.convertToHtml !== 'function') {
    throw new Error('文档解析组件加载失败，请刷新页面后重试')
  }

  const arrayBuffer = await file.arrayBuffer()
  // docx 是 zip，最小也有几百字节；空文件直接给明确提示
  if (arrayBuffer.byteLength === 0) {
    throw new Error('文件内容为空')
  }
  // zip 魔术字节 PK\x03\x04：.doc 改名成 .docx 是最常见的失败原因
  const magic = new Uint8Array(arrayBuffer.slice(0, 4))
  if (!(magic[0] === 0x50 && magic[1] === 0x4b)) {
    throw new Error('这不是真正的 .docx 文件（可能是 .doc 改了扩展名），请在 Word/WPS 里另存为 .docx')
  }
  const images: DocxImage[] = []
  const skippedTypes: string[] = []

  const convertImage = mammoth.images.imgElement(async (image) => {
    const contentType = (image.contentType || '').toLowerCase()
    if (!WEB_SAFE_TYPES.has(contentType)) {
      // EMF/WMF 等矢量格式浏览器无法解码、服务端也不接收，只能跳过
      if (!skippedTypes.includes(contentType)) skippedTypes.push(contentType || '未知格式')
      return { src: '' }
    }
    // 单张图片读取失败不应让整篇导入失败，跳过它继续处理正文
    try {
      const buffer = await image.readAsArrayBuffer()
      const ext = contentType.split('/')[1] || 'png'
      const placeholder = `${IMG_PLACEHOLDER_PREFIX}${images.length}@@`
      images.push({
        placeholder,
        file: new File([buffer], `docx-${Date.now()}-${images.length}.${ext}`, { type: contentType }),
      })
      return { src: placeholder }
    } catch {
      if (!skippedTypes.includes(contentType)) skippedTypes.push(contentType)
      return { src: '' }
    }
  })

  const { value: html } = await mammoth.convertToHtml({ arrayBuffer }, { convertImage })

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const markdown = serializeBlocks(doc.body)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { markdown, images, skippedTypes }
}

