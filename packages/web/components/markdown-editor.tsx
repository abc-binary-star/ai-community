'use client'

import { useRef, useState, useCallback, useImperativeHandle, forwardRef, type TextareaHTMLAttributes } from 'react'
import {
  Bold, Code, Code2, Eraser, Eye, EyeOff, Heading, Image as ImageIcon, Link2,
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
import { api, apiFetch, ApiError } from '@/lib/api'
import { MarkdownRenderer } from '@/components/markdown-renderer'
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
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => resolve(new File([blob!], 'compressed.jpg', { type: 'image/jpeg' })),
          'image/jpeg',
          quality,
        )
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
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
  // 本地图片：blobUrl -> File，编辑时即时预览，发帖时批量上传
  const localImagesRef = useRef<Map<string, File>>(new Map())
  const valueRef = useRef(value)
  valueRef.current = value
  const [polishing, setPolishing] = useState(false)
  const [preview, setPreview] = useState(false)
  // 记录采纳前的原始内容，支持「恢复原稿」
  const [originalSnapshot, setOriginalSnapshot] = useState<string | null>(null)
  // 语音输入浮层
  const [voiceOpen, setVoiceOpen] = useState(false)

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
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片文件太大，最多 5MB')
      return null
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
          uploadFile = await compressImage(file, 1920, 0.85)
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

  // AI 润色：有选区时润色选段，否则润色全文，完成后直接应用结果
  // onMouseDown preventDefault 阻止 textarea 失焦，onClick 时选区仍然有效
  const handlePolish = async () => {
    const ta = textareaRef.current
    if (!ta) return

    // 因为 onMouseDown preventDefault 了，textarea 没有失焦，直接读取选区
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
      const data = await api.post<{ result: string }>('/ai/rewrite', {
        content: value,
        selection: selection || undefined,
        style: '',
      })
      // 记录润色前的内容，支持「恢复原稿」
      setOriginalSnapshot(value)
      if (selection) {
        onChange(value.slice(0, start) + data.result + value.slice(end))
      } else {
        onChange(data.result)
      }
      toast.success('已应用 AI 润色，可点「恢复原稿」撤销')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 润色失败')
    } finally {
      setPolishing(false)
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
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setPreview((v) => !v)}
            title={preview ? '关闭预览' : '开启分屏预览，左侧编辑右侧实时渲染'}
            aria-pressed={preview}
          >
            {preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {preview ? '关闭预览' : '预览'}
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setVoiceOpen(true)}
            title="语音输入，AI 润色后插入"
          >
            <Mic className="size-3.5" />
            语音
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
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
            AI 润色
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
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
            <Eraser className="size-3.5" />
            清空
          </Button>
          {toolbarEnd && (
            <div className="ml-auto flex items-center gap-2 pl-2">
              {toolbarEnd}
            </div>
          )}
        </div>
        {/* 编辑区：preview 开启时分屏，左编辑右预览 */}
        {preview ? (
          <div className="flex divide-x divide-border" style={{ height }}>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={() => syncScroll('editor')}
              onDrop={async (e) => {
                const handled = await handleImageFiles(Array.from(e.dataTransfer.files))
                if (handled) e.preventDefault()
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault()
                }
              }}
              onPaste={async (e) => {
                // 同步阶段立即检测是否有图片，防止浏览器默认粘贴行为
                const items = Array.from(e.clipboardData.items)
                const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'))
                if (imageItems.length === 0) return
                e.preventDefault()
                const imageFiles = imageItems
                  .map(item => item.getAsFile())
                  .filter((f): f is File => !!f)
                await handleImageFiles(imageFiles)
              }}
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
            onChange={(e) => onChange(e.target.value)}
            onDrop={async (e) => {
              const handled = await handleImageFiles(Array.from(e.dataTransfer.files))
              if (handled) e.preventDefault()
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
              }
            }}
              onPaste={async (e) => {
                // 同步阶段立即检测是否有图片，防止浏览器默认粘贴行为
                const items = Array.from(e.clipboardData.items)
                const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'))
                if (imageItems.length === 0) return
                e.preventDefault()
                const imageFiles = imageItems
                  .map(item => item.getAsFile())
                  .filter((f): f is File => !!f)
                await handleImageFiles(imageFiles)
              }}
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
    </div>
  )
})
