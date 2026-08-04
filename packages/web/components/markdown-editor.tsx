'use client'

import { useRef, useState, useCallback, useImperativeHandle, forwardRef, type TextareaHTMLAttributes } from 'react'
import {
  Bold, Code, Code2, Eraser, Eye, EyeOff, FileText, Heading, Image as ImageIcon, Link2,
  List, ListOrdered, ListChecks, Mic, Quote, Sparkles, Loader2, Strikethrough,
  Table as TableIcon, Type, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { api, apiFetch, apiFetchStream, ApiError } from '@/lib/api'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { extractExternalImageUrls, hasMdImage, normalizeMdImages } from '@/lib/markdown-images'
import { convertDocxToMarkdown, isDocxFile, isLegacyDocFile } from '@/lib/docx-import'
import { FONT_OPTIONS, fontFamily } from '@/lib/font-options'
import { VoiceComposer } from '@/app/community/components/voice-composer'

export interface MarkdownEditorHandle {
  resolveImages: () => Promise<string>
}

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  height?: number
  className?: string
  toolbarEnd?: React.ReactNode
  font?: string
  onFontChange?: (key: string) => void
}

interface ToolbarBtn {
  icon: React.ReactNode
  label: string
  action: (textarea: HTMLTextAreaElement, value: string, onChange: (v: string) => void) => void
}

// 压缩图片：缩放到最大尺寸，输出 JPEG Blob
export function compressImage(file: File, maxSize: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        // 取不到 2d 上下文（如超大尺寸导致 canvas 分配失败）时退回原文件
        if (!ctx) {
          resolve(file)
          return
        }
        try {
          ctx.drawImage(img, 0, 0, width, height)
        } catch {
          resolve(file)
          return
        }
        canvas.toBlob(
          // toBlob 可能回传 null（编码失败），此时用原文件兜底而不是抛错
          (blob) => resolve(blob ? new File([blob], 'compressed.jpg', { type: 'image/jpeg' }) : file),
          'image/jpeg',
          quality,
        )
      }
      // 解码失败（如损坏/不支持的格式）：返回原文件，交由后端校验兜底
      img.onerror = () => resolve(file)
      img.src = reader.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

// dataURL 转 File（Word/网页复制的 HTML 中内嵌图片通常为 base64）
function dataURLToFile(dataUrl: string): File | null {
  try {
    const [header, base64 = ''] = dataUrl.split(',')
    const mime = /^data:(image\/[^;,]+)/.exec(header)?.[1] || 'image/png'
    // 部分来源会对 base64 做百分号编码（如 %2B）；Word 等还会在 base64 中插入换行/空格，需清洗
    const b64 = (base64.includes('%') ? decodeURIComponent(base64) : base64).replace(/[\r\n\s]/g, '')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const ext = mime.split('/')[1]?.split(';')[0] || 'png'
    return new File([bytes], `pasted-${Date.now()}.${ext}`, { type: mime })
  } catch {
    return null
  }
}

// 判断是否为图片文件：MIME 以 image/ 开头，或文件名带常见图片扩展名。
// Mac 上 Word 复制的图片文件项 type 常为 public.png / public.jpeg 等 UTI，需靠扩展名兜底
function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i.test(file.name)
}

// 递归把 DOM 转成纯文本：块级元素与 <br> 后补换行，&nbsp; 转普通空格
const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'hr',
])
function htmlToText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u00a0/g, ' ')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  let out = ''
  for (const child of Array.from(el.childNodes)) out += htmlToText(child)
  if (tag === 'br' || BLOCK_TAGS.has(tag)) out += '\n'
  return out
}

interface PastedImage {
  placeholder: string
  source: File | string // string 为可直引用的外链图片地址
}

// 本地文档（Word/WPS）复制时，剪贴板 HTML 里的图片是 file:// 临时文件路径。
// 浏览器禁止网页读取 file://，这类图片无法恢复，只能计数后提示用户改用 .docx 导入
function isUnreadableImageSrc(src: string): boolean {
  const s = src.trim()
  if (!s) return false
  return !/^(data:image\/|https?:\/\/|blob:)/i.test(s)
}

// 解析 Word/网页复制的 HTML：提取内嵌 base64 图片与外链图片，同时转为保留换行的纯文本。
// file:/// 等浏览器无法读取的图片直接丢弃，数量记在 skippedLocal 里供上层提示。
function parseRichHtml(html: string): { text: string; images: PastedImage[]; skippedLocal: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images: PastedImage[] = []
  const seenSrc = new Set<string>()
  // 无法读取的本地图片地址（去重后计数）
  const unreadable = new Set<string>()

  // 尝试把图片源加入列表；返回是否成功加入（成功时占位符为列表最后一个）
  const addSource = (src: string): boolean => {
    const s = src.trim()
    if (!s || seenSrc.has(s)) return false
    seenSrc.add(s)
    if (s.startsWith('data:image/')) {
      const file = dataURLToFile(s)
      if (!file) return false
      images.push({ placeholder: `@@IMG_${images.length}@@`, source: file })
      return true
    }
    if (/^https?:\/\//i.test(s)) {
      images.push({ placeholder: `@@IMG_${images.length}@@`, source: s })
      return true
    }
    return false
  }

  Array.from(doc.querySelectorAll('img')).forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (addSource(src)) {
      const placeholder = images[images.length - 1].placeholder
      img.parentNode?.replaceChild(doc.createTextNode(placeholder), img)
    } else {
      if (isUnreadableImageSrc(src)) unreadable.add(src.trim())
      img.parentNode?.removeChild(img)
    }
  })

  // 兜底：部分 Word 版本把图片放在 <v:imagedata> 或 CSS 里而非 <img>，
  // 用正则全量扫描 data URL 补抓（已处理过的跳过）
  const globalDataUrls = html.match(/data:image\/[^"'>]*/g) || []
  for (const src of globalDataUrls) {
    if (addSource(src)) {
      const placeholder = images[images.length - 1].placeholder
      doc.body.appendChild(doc.createTextNode(`\n${placeholder}\n`))
    }
  }

  // 兜底：Word 的图片有时放在 <v:imagedata src="file://..."> 或条件注释里，
  // DOMParser 不一定暴露成 <img>，用正则全量扫一遍本地图片路径补计数
  const localRefs = html.match(/(?:src|href)=["'](file:\/\/[^"']+)["']/gi) || []
  for (const ref of localRefs) {
    const src = ref.replace(/^(?:src|href)=["']/i, '').replace(/["']$/, '')
    if (/\.(png|jpe?g|gif|webp|bmp|tiff?|emf|wmf)$/i.test(src)) unreadable.add(src)
  }

  return { text: htmlToText(doc.body), images, skippedLocal: unreadable.size }
}

// 在光标位置插入文本，支持选区替换
function insertText(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  before: string,
  after: string = '',
  placeholder: string = '',
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = value.slice(start, end) || placeholder
  const newText = value.slice(0, start) + before + selected + after + value.slice(end)
  onChange(newText)
  requestAnimationFrame(() => {
    textarea.focus()
    const pos = start + before.length
    textarea.setSelectionRange(pos, pos + selected.length)
  })
}

// 在行首插入前缀
function insertLinePrefix(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
) {
  const start = textarea.selectionStart
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const newText = value.slice(0, lineStart) + prefix + value.slice(lineStart)
  onChange(newText)
  requestAnimationFrame(() => {
    textarea.focus()
    const pos = start + prefix.length
    textarea.setSelectionRange(pos, pos)
  })
}

const TOOLBAR: ToolbarBtn[] = [
  {
    icon: <Heading className="size-4" />, label: '标题',
    action: (ta, v, cb) => insertLinePrefix(ta, v, cb, '## '),
  },
  {
    icon: <Bold className="size-4" />, label: '粗体',
    action: (ta, v, cb) => insertText(ta, v, cb, '**', '**', '粗体文本'),
  },
  {
    icon: <Strikethrough className="size-4" />, label: '删除线',
    action: (ta, v, cb) => insertText(ta, v, cb, '~~', '~~', '删除线文本'),
  },
  {
    icon: <Quote className="size-4" />, label: '引用',
    action: (ta, v, cb) => insertLinePrefix(ta, v, cb, '> '),
  },
  {
    icon: <Code className="size-4" />, label: '行内代码',
    action: (ta, v, cb) => insertText(ta, v, cb, '`', '`', 'code'),
  },
  {
    icon: <Code2 className="size-4" />, label: '代码块',
    action: (ta, v, cb) => insertText(ta, v, cb, '```ts\n', '\n```', '// code here'),
  },
  {
    icon: <Link2 className="size-4" />, label: '链接',
    action: (ta, v, cb) => insertText(ta, v, cb, '[', '](https://)', '链接文字'),
  },
  {
    icon: <ImageIcon className="size-4" />, label: '图片',
    action: (ta, v, cb) => insertText(ta, v, cb, '![', '](https://)', '图片描述'),
  },
  {
    icon: <List className="size-4" />, label: '无序列表',
    action: (ta, v, cb) => insertLinePrefix(ta, v, cb, '- '),
  },
  {
    icon: <ListOrdered className="size-4" />, label: '有序列表',
    action: (ta, v, cb) => insertLinePrefix(ta, v, cb, '1. '),
  },
  {
    icon: <ListChecks className="size-4" />, label: '任务列表',
    action: (ta, v, cb) => insertLinePrefix(ta, v, cb, '- [ ] '),
  },
  {
    icon: <TableIcon className="size-4" />, label: '表格',
    action: (ta, v, cb) => insertText(ta, v, cb, '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| ', ' |  |  |\n', '内容'),
  },
]

// 全文字体选项见 lib/font-options.ts（免费可商用字体，SIL OFL / 免费商用授权）

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  placeholder = '支持 Markdown 语法，输入 @ 可提及用户',
  height = 400,
  className,
  toolbarEnd,
  font = FONT_OPTIONS[0].key,
  onFontChange,
}, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docxInputRef = useRef<HTMLInputElement>(null)
  // 本地图片：blobUrl -> File，编辑时即时预览，发帖时批量上传
  const localImagesRef = useRef<Map<string, File>>(new Map())
  const valueRef = useRef(value)
  valueRef.current = value
  const [polishing, setPolishing] = useState(false)
  // 流式润色进度：done 为已完成段数，total 为总段数
  const [polishProgress, setPolishProgress] = useState<{ done: number; total: number } | null>(null)
  const [preview, setPreview] = useState(false)
  // 记录采纳前的原始内容，支持「恢复原稿」
  const [originalSnapshot, setOriginalSnapshot] = useState<string | null>(null)
  // 语音输入浮层
  const [voiceOpen, setVoiceOpen] = useState(false)

  // 字数统计：按 Unicode 字符计数，与后端 len([]rune) 一致
  const charCount = [...value].length

  // Word 文档解析中的提示态
  const [importing, setImporting] = useState(false)
  // 外站图片转存中的提示态
  const [mirroring, setMirroring] = useState(false)
  // 已尝试转存过的外站地址，避免重复请求（含失败的，失败不再自动重试）
  const mirroredRef = useRef<Set<string>>(new Set())

  // 把外站图片交给服务端转存，再把正文里的原地址替换为本站地址。
  // B站/贴吧图床有 Referer 防盗链，浏览器直接引用会 403，必须服务端代拉取。
  const mirrorExternalImages = useCallback(async (text: string) => {
    const urls = extractExternalImageUrls(text).filter((u) => !mirroredRef.current.has(u))
    if (urls.length === 0) return
    urls.forEach((u) => mirroredRef.current.add(u))

    setMirroring(true)
    try {
      const data = await api.post<{ items: { sourceUrl: string; url?: string; error?: string }[] }>(
        '/upload/remote-images',
        { urls: urls.slice(0, 10) },
      )
      let next = valueRef.current
      let okCount = 0
      const failed: string[] = []
      for (const item of data.items) {
        if (item.url) {
          next = next.replaceAll(item.sourceUrl, item.url)
          okCount++
        } else {
          failed.push(item.error || '未知原因')
        }
      }
      if (okCount > 0) {
        onChange(next)
        toast.success(`已转存 ${okCount} 张外站图片`)
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} 张图片转存失败：${failed[0]}`)
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '外站图片转存失败')
    } finally {
      setMirroring(false)
    }
  }, [onChange])

  // textarea 输入统一入口：兜底把 B站/贴吧的图片语法转成标准 ![图片](url)。
  // handlePaste 未拦截（如浏览器默认粘贴、拖拽文本、输入法直接上屏）时，这里仍能生效
  const handleTextareaChange = useCallback((next: string) => {
    const normalized = hasMdImage(next) ? normalizeMdImages(next) : next
    onChange(normalized)
    if (normalized !== next) {
      // 刚由 B站式语法转成标准语法，说明是外站图片，尝试转存
      void mirrorExternalImages(normalized)
    }
  }, [onChange, mirrorExternalImages])

  // 同步滚动：按滚动比例在两栏间同步
  const syncScroll = (source: 'editor' | 'preview') => {
    if (syncingRef.current) return
    const editor = textareaRef.current
    const preview = previewRef.current
    if (!editor || !preview) return

    syncingRef.current = true
    if (source === 'editor') {
      const ratio = editor.scrollTop / Math.max(editor.scrollHeight - editor.clientHeight, 1)
      preview.scrollTop = ratio * Math.max(preview.scrollHeight - preview.clientHeight, 1)
    } else {
      const ratio = preview.scrollTop / Math.max(preview.scrollHeight - preview.clientHeight, 1)
      editor.scrollTop = ratio * Math.max(editor.scrollHeight - editor.clientHeight, 1)
    }
    // 下一帧释放锁，避免来回触发
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }

  const handleAction = useCallback((btn: ToolbarBtn) => {
    if (btn.label === '图片') {
      fileInputRef.current?.click()
      return
    }
    if (textareaRef.current) {
      btn.action(textareaRef.current, value, onChange)
    }
  }, [value, onChange])

  const uploadImage = async (file: File): Promise<string | null> => {
    // 超过 5MB 自动压缩（缩放到 2560px、JPEG 92%，保留较高清晰度），而非直接拒绝
    if (file.size > 5 * 1024 * 1024) {
      toast.info('图片超过 5MB，已自动压缩')
      file = await compressImage(file, 2560, 0.92)
    }
    // 编辑时用本地 blob URL 即时预览，发帖时再上传
    const blobUrl = URL.createObjectURL(file)
    localImagesRef.current.set(blobUrl, file)
    return blobUrl
  }

  // 发帖前调用：上传所有本地图片，替换 markdown 中的 blob URL 为 OSS URL
  const resolveLocalImages = useCallback(async (): Promise<string> => {
    const localImages = localImagesRef.current
    if (localImages.size === 0) return valueRef.current
    let resolved = valueRef.current
    for (const [blobUrl, file] of localImages) {
      if (!resolved.includes(blobUrl)) {
        URL.revokeObjectURL(blobUrl)
        localImages.delete(blobUrl)
        continue
      }
      try {
        let uploadFile = file
        if (file.size > 1024 * 1024) {
          uploadFile = await compressImage(file, 2560, 0.92)
        }
        const formData = new FormData()
        formData.append('file', uploadFile)
        const data = await apiFetch<{ url: string }>('/upload/image', { method: 'POST', body: formData })
        resolved = resolved.replaceAll(blobUrl, data.url)
        URL.revokeObjectURL(blobUrl)
        localImages.delete(blobUrl)
      } catch (err) {
        console.error('[Upload] 图片上传失败:', err)
        toast.error(`图片上传失败: ${file.name || '未知'}`)
      }
    }
    onChange(resolved)
    return resolved
  }, [onChange])

  useImperativeHandle(ref, () => ({ resolveImages: resolveLocalImages }))

  // 在光标位置插入图片 markdown，从 textarea 读取最新内容和选区
  const insertImageAtCursor = (url: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const current = ta.value
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = current.slice(0, start)
    const after = current.slice(end)
    const insertion = `![图片](${url})`
    onChange(before + insertion + after)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + insertion.length
      ta.setSelectionRange(pos, pos)
    })
  }

  // 处理粘贴/拖拽中的图片文件（多图一次性插入，避免 React 批量更新丢帧）
  const handleImageFiles = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    if (images.length === 0) return false
    const ta = textareaRef.current
    const current = ta ? ta.value : valueRef.current
    const start = ta ? ta.selectionStart : current.length
    const end = ta ? ta.selectionEnd : current.length
    let insertion = ''
    for (const file of images) {
      const url = await uploadImage(file)
      if (url) insertion += `![图片](${url})\n`
    }
    if (insertion) {
      const newValue = current.slice(0, start) + insertion + current.slice(end)
      onChange(newValue)
      requestAnimationFrame(() => {
        if (!ta) return
        ta.focus()
        const pos = start + insertion.length
        ta.setSelectionRange(pos, pos)
      })
    }
    return true
  }

  // 导入 .docx：整篇转 markdown 后在光标处插入，图片走既有的延迟上传链路。
  // 这是保留 Word 全部图片的可靠路径——粘贴时图片是 file:// 路径，网页读不到
  const importDocx = async (file: File) => {
    if (isLegacyDocFile(file) && !isDocxFile(file)) {
      toast.error('不支持 .doc 格式，请在 Word/WPS 中另存为 .docx 后重试')
      return
    }
    setImporting(true)
    try {
      const { markdown, images, skippedTypes } = await convertDocxToMarkdown(file)
      if (!markdown && images.length === 0) {
        toast.error('文档为空或无法解析')
        return
      }

      let text = markdown
      for (const img of images) {
        const url = await uploadImage(img.file)
        // 上传失败时清掉占位符，避免残留在正文里
        text = text.replaceAll(img.placeholder, url ?? '')
      }
      text = text.replace(/!\[[^\]]*\]\(\s*\)/g, '').replace(/\n{3,}/g, '\n\n').trim()

      const ta = textareaRef.current
      const current = ta ? ta.value : valueRef.current
      const start = ta ? ta.selectionStart : current.length
      const end = ta ? ta.selectionEnd : current.length
      const prefix = current.slice(0, start)
      const needBreak = prefix.length > 0 && !prefix.endsWith('\n\n')
      const insertion = (needBreak ? '\n\n' : '') + text + '\n'
      onChange(prefix + insertion + current.slice(end))
      requestAnimationFrame(() => {
        if (!ta) return
        ta.focus()
        const pos = start + insertion.length
        ta.setSelectionRange(pos, pos)
      })

      toast.success(images.length > 0 ? `已导入文档，含 ${images.length} 张图片` : '已导入文档')
      if (skippedTypes.length > 0) {
        toast.warning(`${skippedTypes.length} 类图片无法导入（${skippedTypes.join('、')}），Word 图表/公式需先转成图片`)
      }
    } catch (err) {
      console.error('[DocxImport] 导入失败:', err)
      // 把真实原因透出来，笼统提示会让人误以为文件本身有问题
      const reason = err instanceof Error && err.message ? err.message : '未知错误'
      toast.error('Word 文档导入失败', { description: reason })
    } finally {
      setImporting(false)
    }
  }

  // 拖拽入口：.docx 走文档导入，其余按图片处理
  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer.files)
    const docx = files.find((f) => isDocxFile(f) || isLegacyDocFile(f))
    if (docx) {
      e.preventDefault()
      await importDocx(docx)
      return
    }
    const handled = await handleImageFiles(files)
    if (handled) e.preventDefault()
  }

  // 处理粘贴：兼容 Word/网页复制的「文字 + 图片」。
  // 图片来源：① HTML 内嵌 base64 图片；② HTML 中可直接引用的外链图片；③ 剪贴板文件项（截图/复制图片文件）；
  // ④ B站/贴吧等复制时以 markdown 文本（BT 包裹 url 或 ![](url)）形式存在的图片（无 img、无文件项）。
  // 文字从 HTML 转纯文本（保留换行），避免默认粘贴丢弃图片。
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const cd = e.clipboardData
    const html = cd.getData('text/html')
    const parsed = html ? parseRichHtml(html) : null
    const plainText = cd.getData('text/plain') || ''

    // 剪贴板文件项中的图片（Mac 上 Word 复制时图片以文件项提供，type 常为 public.png 等 UTI）
    const fileImages = Array.from(cd.files).filter(isImageFile)

    // B站/贴吧复制时图片以 markdown 文本形式存在（无 <img> 标签、无文件项），需识别
    const textHasImages = hasMdImage(parsed?.text ?? '') || hasMdImage(plainText)

    // 本地 Word/WPS 文档的图片在剪贴板里是 file:// 临时路径，浏览器无权读取。
    // 静默丢弃会让人以为编辑器有问题，这里明确告知并指路 .docx 导入。
    // Mac 上 Word 常把图片同时放进文件项，已取到的部分要从丢失数里扣掉，避免虚报
    const lost = (parsed?.skippedLocal ?? 0) - fileImages.length
    if (lost > 0) {
      toast.warning(`${lost} 张图片来自本地文档，浏览器无法读取`, {
        description: '改用「导入 Word」直接读 .docx 文件，可完整保留图片',
        duration: 8000,
        action: { label: '导入 Word', onClick: () => docxInputRef.current?.click() },
      })
    }

    // 没有任何图片来源时不拦截，保持浏览器默认粘贴（纯文本）。
    // 注意：Word 可能把图片全放文件项、HTML 为空（parsed 为 null），此时也必须拦截
    if (fileImages.length === 0 && !(parsed && parsed.images.length > 0) && !textHasImages) return
    e.preventDefault()

    const ta = textareaRef.current
    const current = ta ? ta.value : valueRef.current
    const start = ta ? ta.selectionStart : current.length
    const end = ta ? ta.selectionEnd : current.length

    // HTML 内嵌/外链图片：按原位置替换占位符
    // 优先用 HTML 转文本；若 HTML 转文本后没有图片语法、而纯文本里有（B站复制时常见），用纯文本兜底
    let inserted = parsed ? parsed.text : plainText
    if (parsed && !hasMdImage(inserted) && hasMdImage(plainText)) inserted = plainText

    for (const img of (parsed?.images ?? [])) {
      const url = typeof img.source === 'string' ? img.source : await uploadImage(img.source)
      if (!url) continue
      inserted = inserted.replace(img.placeholder, `![图片](${url})`)
    }
    // 剪贴板文件图片：文本里已有 B站式图片语法时优先用外链（文件项是同一张图，追加会重复），
    // 仅在文本无图片语法时追加（截图/复制图片文件场景）
    if (!hasMdImage(inserted)) {
      for (const file of fileImages) {
        const url = await uploadImage(file)
        if (!url) continue
        inserted += (inserted && !inserted.endsWith('\n') ? '\n' : '') + `![图片](${url})` + '\n'
      }
    }
    // 清理未匹配的占位符，收敛多余空行
    inserted = inserted.replace(/@@IMG_\d+@@/g, '').replace(/\n{3,}/g, '\n\n').trim()
    // B站/贴吧复制的 markdown 图片语法规范化为标准图片语法
    inserted = normalizeMdImages(inserted)

    if (!inserted) return
    const newValue = current.slice(0, start) + inserted + current.slice(end)
    onChange(newValue)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const pos = start + inserted.length
      ta.setSelectionRange(pos, pos)
    })
    // 粘贴进来的外站图片（B站/贴吧等有防盗链）交给服务端转存
    void mirrorExternalImages(newValue)
  }, [onChange, mirrorExternalImages])

  // AI 润色：有选区时走单次请求；全文按块流式返回，先到的段落先展示
  // onMouseDown preventDefault 阻止 textarea 失焦，onClick 时选区仍然有效
  const handlePolish = async () => {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selection = start !== end ? value.slice(start, end) : ''

    if (!selection && !value.trim()) {
      toast.error('请先输入内容')
      return
    }
    if (selection && selection.trim().length < 2) {
      toast.error('选段内容太短')
      return
    }

    setPolishing(true)
    try {
      setOriginalSnapshot(value)
      if (selection) {
        const data = await api.post<{ result: string }>('/ai/rewrite', {
          content: value,
          selection,
          style: '',
        })
        onChange(value.slice(0, start) + data.result + value.slice(end))
        toast.success('已应用 AI 润色，可点「恢复原稿」撤销')
        return
      }

      const response = await apiFetchStream('/ai/rewrite-stream', {
        method: 'POST',
        body: JSON.stringify({ content: value, style: '' }),
      })
      if (!response.body) throw new Error('流式响应不可用')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result = ''
      let received = 0

      const consume = (text: string) => {
        buffer += text
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const event of events) {
          const line = event.split('\n').find((item) => item.startsWith('data: '))
          if (!line) continue
          const data = JSON.parse(line.slice(6)) as { result?: string; error?: string; index?: number; total?: number }
          if (data.error) throw new Error(data.error)
          if (!data.result) continue
          result += (received > 0 ? '\n\n' : '') + data.result
          received += 1
          onChange(result)
          setPolishProgress({ done: received, total: data.total ?? received })
        }
      }

      while (true) {
        const { value: chunk, done } = await reader.read()
        if (done) break
        consume(decoder.decode(chunk, { stream: true }))
      }
      consume(decoder.decode())
      if (!result) throw new Error('AI 未返回润色结果')
      toast.success('已完成 AI 润色，可点「恢复原稿」撤销')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'AI 润色失败')
    } finally {
      setPolishing(false)
      setPolishProgress(null)
    }
  }

  // 恢复原稿
  const handleRestore = () => {
    if (originalSnapshot === null) return
    onChange(originalSnapshot)
    setOriginalSnapshot(null)
    toast.success('已恢复原稿')
  }

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className="rounded-lg border border-input bg-card overflow-hidden">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/50 p-1.5">
          {TOOLBAR.map((btn) => (
            <Button
              key={btn.label}
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => handleAction(btn)}
              title={btn.label}
              aria-label={btn.label}
            >
              {btn.icon}
            </Button>
          ))}
          {/* 全文字体：选择后全文统一应用，实时生效并随发布保存 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                title="字体（全文）"
                aria-label="字体（全文）"
              >
                <Type className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 p-1.5">
              <DropdownMenuLabel className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                字体 · 全文统一 · 全部免费商用授权
              </DropdownMenuLabel>
              {FONT_OPTIONS.map((f) => {
                const active = font === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => onFontChange?.(f.key)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                      active ? 'bg-accent text-accent-foreground' : ''
                    }`}
                    style={{ fontFamily: f.family }}
                  >
                    <span>{f.name}</span>
                    <span className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-sans)' }}>
                      {f.hint}
                    </span>
                  </button>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setPreview((v) => !v)}
            title={preview ? '关闭预览' : '开启分屏预览，左侧编辑右侧实时渲染'}
            aria-pressed={preview}
          >
            {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={importing}
            onClick={() => docxInputRef.current?.click()}
            title={importing ? '正在解析…' : '导入 .docx 文档，完整保留文字与图片（也可直接把文件拖进编辑区）'}
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setVoiceOpen(true)}
            title="语音输入，AI 润色后插入"
          >
            <Mic className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-primary"
            disabled={polishing}
            onMouseDown={(e) => {
              // 阻止默认行为：防止 textarea 失焦，保持选区有效
              e.preventDefault()
            }}
            onClick={handlePolish}
            title="选中文字后点击只润色选段，未选中润色全文"
          >
            {polishing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {polishing
              ? polishProgress
                ? `润色中 ${polishProgress.done}/${polishProgress.total}`
                : '润色中…'
              : 'AI 润色'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            disabled={!value.trim()}
            onClick={() => {
              if (!value.trim()) return
              if (window.confirm('确定要清空全部内容吗？此操作不可撤销。')) {
                onChange('')
                setOriginalSnapshot(null)
                toast.success('已清空')
              }
            }}
            title="清空全部内容"
          >
            <Eraser className="size-4" />
          </Button>
          {mirroring && (
            <span className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              转存中…
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 pl-2">
            <span className={cn(
              'text-xs tabular-nums whitespace-nowrap',
              charCount > 40000 ? 'text-destructive font-medium' : 'text-muted-foreground',
            )}>
              {charCount.toLocaleString()}/40,000
            </span>
            {toolbarEnd}
          </div>
        </div>
        {/* 流式润色进度条：跟随分段完成度增长，替代弹窗提示 */}
        {polishing && (
          <div
            className="h-0.5 w-full overflow-hidden bg-muted"
            role="progressbar"
            aria-label="AI 润色进度"
            aria-valuemin={0}
            aria-valuemax={polishProgress?.total ?? 100}
            aria-valuenow={polishProgress?.done ?? 0}
          >
            <div
              className={cn(
                'h-full bg-primary transition-all duration-500',
                !polishProgress && 'w-1/4 animate-pulse',
              )}
              style={
                polishProgress
                  ? { width: `${Math.round((polishProgress.done / polishProgress.total) * 100)}%` }
                  : undefined
              }
            />
          </div>
        )}
        {/* 编辑区：preview 开启时分屏，左编辑右预览 */}
        {preview ? (
          <div className="flex divide-x divide-border" style={{ height }}>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => handleTextareaChange(e.target.value)}
              onScroll={() => syncScroll('editor')}
              onDrop={handleDrop}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault()
                }
              }}
              onPaste={handlePaste}
              placeholder={placeholder}
              className="h-full w-1/2 resize-none rounded-none border-0 text-sm leading-6 focus-visible:ring-0"
              style={{ fontFamily: fontFamily(font) }}
            />
            <div
              ref={previewRef}
              onScroll={() => syncScroll('preview')}
              className="h-full w-1/2 overflow-y-auto bg-background p-4"
              style={{ fontFamily: fontFamily(font) }}
            >
              {value.trim() ? (
                <MarkdownRenderer content={value} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  开始输入内容，这里会实时渲染效果
                </div>
              )}
            </div>
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleTextareaChange(e.target.value)}
            onDrop={handleDrop}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
              }
            }}
              onPaste={handlePaste}
              placeholder={placeholder}
              className="min-h-[120px] resize-y rounded-none border-0 text-sm leading-6 focus-visible:ring-0"
            style={{ height, fontFamily: fontFamily(font) }}
          />
        )}
      </div>
      {/* 已应用润色：轻量状态条 */}
      {originalSnapshot !== null && (
        <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <Sparkles className="size-3" />
            已应用 AI 润色
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleRestore}
          >
            <Undo2 className="size-3" />
            恢复原稿
          </Button>
        </div>
      )}
      {voiceOpen && (
        <VoiceComposer
          target="paragraph"
          onInsert={(text) => {
            // 在光标位置插入新段落，前后加空行
            const ta = textareaRef.current
            if (!ta) {
              onChange(value + (value ? '\n\n' : '') + text)
              return
            }
            const start = ta.selectionStart
            const prefix = value.slice(0, start)
            const suffix = value.slice(start)
            const needLeadingBreak = prefix.length > 0 && !prefix.endsWith('\n\n')
            const insertion = (needLeadingBreak ? '\n\n' : '') + text + '\n\n'
            const newValue = prefix + insertion + suffix
            onChange(newValue)
            requestAnimationFrame(() => {
              ta.focus()
              const pos = start + insertion.length
              ta.setSelectionRange(pos, pos)
            })
          }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const url = await uploadImage(file)
          if (url) insertImageAtCursor(url)
          e.target.value = ''
        }}
      />
      <input
        ref={docxInputRef}
        type="file"
        accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          // 先清空再解析：同一文件二次选择也能触发 onChange
          e.target.value = ''
          if (file) await importDocx(file)
        }}
      />
    </div>
  )
})
