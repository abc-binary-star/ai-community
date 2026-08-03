'use client'

import { useRef, useState, useCallback, type TextareaHTMLAttributes } from 'react'
import {
  Bold, Code, Code2, Heading, Image as ImageIcon, Link2,
  List, ListOrdered, ListChecks, Quote, Strikethrough, Table as TableIcon,
  Sparkles, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { DiffPanel } from '@/components/diff-panel'

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
  const [polishing, setPolishing] = useState(false)
  // 持续追踪 textarea 的选区位置，避免点击按钮时选区丢失
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const [diffState, setDiffState] = useState<{
    original: string
    rewritten: string
    selection: string
    selStart: number
    selEnd: number
  } | null>(null)

  // 记录选区变化
  const handleSelect = () => {
    const ta = textareaRef.current
    if (!ta) return
    selRef.current = { start: ta.selectionStart, end: ta.selectionEnd }
  }

  const handleAction = useCallback((btn: ToolbarBtn) => {
    if (textareaRef.current) {
      btn.action(textareaRef.current, value, onChange)
    }
  }, [value, onChange])

  // AI 润色：有选区时润色选段，否则润色全文
  const handlePolish = async () => {
    const ta = textareaRef.current
    if (!ta) return

    // 如果 diff 面板已打开，先关闭（避免重复润色已采纳的内容）
    if (diffState) {
      setDiffState(null)
      return
    }

    // 从 ref 中读取最后记录的选区位置
    const { start, end } = selRef.current
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
        selection,
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
    if (diffState.selection) {
      // 选段润色：替换选区部分
      const newText = value.slice(0, diffState.selStart) + diffState.rewritten + value.slice(diffState.selEnd)
      onChange(newText)
    } else {
      // 全文润色：替换全部
      onChange(diffState.rewritten)
    }
    setDiffState(null)
    toast.success('已采纳润色结果')
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
          {/* 分隔线 + AI 润色按钮 */}
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-primary"
            disabled={polishing}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handlePolish}
            title="选中文字后点击只润色选段，未选中润色全文"
          >
            {polishing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            AI 润色
          </Button>
        </div>
        {/* 编辑区 */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={handleSelect}
          onClick={handleSelect}
          onKeyUp={handleSelect}
          placeholder={placeholder}
          className="min-h-[120px] resize-y rounded-none border-0 font-mono text-sm leading-6 focus-visible:ring-0"
          style={{ height }}
        />
      </div>
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
