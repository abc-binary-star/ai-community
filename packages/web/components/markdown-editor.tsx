'use client'

import { useRef, useState, useCallback, type TextareaHTMLAttributes } from 'react'
import {
  Bold, Code, Code2, Eraser, Eye, EyeOff, Heading, Image as ImageIcon, Link2,
  List, ListOrdered, ListChecks, Quote, Strikethrough, Table as TableIcon,
  Sparkles, Loader2, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { DiffPanel } from '@/components/diff-panel'
import { MarkdownRenderer } from '@/components/markdown-renderer'

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  height?: number
  className?: string
}

interface ToolbarBtn {
  icon: React.ReactNode
  label: string
  action: (textarea: HTMLTextAreaElement, value: string, onChange: (v: string) => void) => void
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

export function MarkdownEditor({
  value,
  onChange,
  placeholder = '支持 Markdown 语法，输入 @ 可提及用户',
  height = 400,
  className,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const [polishing, setPolishing] = useState(false)
  const [preview, setPreview] = useState(false)
  const [diffState, setDiffState] = useState<{
    original: string
    rewritten: string
    isSelection: boolean
    selStart: number
    selEnd: number
  } | null>(null)
  // 记录采纳前的原始内容，支持「恢复原稿」
  const [originalSnapshot, setOriginalSnapshot] = useState<string | null>(null)

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
    if (textareaRef.current) {
      btn.action(textareaRef.current, value, onChange)
    }
  }, [value, onChange])

  // AI 润色：有选区时润色选段，否则润色全文
  // onMouseDown preventDefault 阻止 textarea 失焦，onClick 时选区仍然有效
  const handlePolish = async () => {
    const ta = textareaRef.current
    if (!ta) return

    // 如果 diff 面板已打开，先关闭
    if (diffState) {
      setDiffState(null)
      return
    }

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
      setDiffState({
        original: selection || value,
        rewritten: data.result,
        isSelection: !!selection,
        selStart: start,
        selEnd: end,
      })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 润色失败')
    } finally {
      setPolishing(false)
    }
  }

  // 采纳润色结果
  const handleAccept = () => {
    if (!diffState) return
    // 记录采纳前的原始内容，用于「恢复原稿」
    setOriginalSnapshot(value)
    if (diffState.isSelection) {
      // 选段润色：只替换选区部分
      const newText = value.slice(0, diffState.selStart) + diffState.rewritten + value.slice(diffState.selEnd)
      onChange(newText)
    } else {
      // 全文润色：替换全部
      onChange(diffState.rewritten)
    }
    setDiffState(null)
    toast.success('已采纳润色结果，可点「恢复原稿」撤销')
  }

  // 恢复原稿
  const handleRestore = () => {
    if (originalSnapshot === null) return
    onChange(originalSnapshot)
    setOriginalSnapshot(null)
    toast.success('已恢复原稿')
  }

  const handleReject = () => {
    setDiffState(null)
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
                setDiffState(null)
                setOriginalSnapshot(null)
                toast.success('已清空')
              }
            }}
            title="清空全部内容"
          >
            <Eraser className="size-3.5" />
            清空
          </Button>
        </div>
        {/* 编辑区：preview 开启时分屏，左编辑右预览 */}
        {preview ? (
          <div className="flex h-[400px] divide-x divide-border">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={() => syncScroll('editor')}
              placeholder={placeholder}
              className="h-full w-1/2 resize-none rounded-none border-0 font-mono text-sm leading-6 focus-visible:ring-0"
            />
            <div
              ref={previewRef}
              onScroll={() => syncScroll('preview')}
              className="h-full w-1/2 overflow-y-auto bg-background p-4"
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
            placeholder={placeholder}
            className="min-h-[120px] resize-y rounded-none border-0 font-mono text-sm leading-6 focus-visible:ring-0"
            style={{ height }}
          />
        )}
      </div>
      {/* 已采纳润色：轻量状态条 */}
      {originalSnapshot !== null && !diffState && (
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
      {/* diff 面板 */}
      {diffState && (
        <DiffPanel
          original={diffState.original}
          rewritten={diffState.rewritten}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
    </div>
  )
}
