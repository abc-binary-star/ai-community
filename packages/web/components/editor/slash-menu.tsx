'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Braces, CheckSquare, Code2, Heading1, Heading2, Heading3,
  Image as ImageIcon, List, ListOrdered, Minus, Quote, Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SlashItem {
  key: string
  label: string
  desc: string
  icon: React.ReactNode
  keywords?: string[]
  run: (editor: Editor) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    key: 'h1',
    label: '一级标题',
    desc: '大标题，用于章节',
    icon: <Heading1 className="size-4" />,
    keywords: ['h1', 'title', '一级', '标题'],
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    label: '二级标题',
    desc: '中标题，用于小节',
    icon: <Heading2 className="size-4" />,
    keywords: ['h2', 'subtitle', '二级'],
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: '三级标题',
    desc: '小标题',
    icon: <Heading3 className="size-4" />,
    keywords: ['h3', '三级'],
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    key: 'paragraph',
    label: '正文',
    desc: '普通段落',
    icon: <Type className="size-4" />,
    keywords: ['text', 'p', '段落'],
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    key: 'bullet',
    label: '无序列表',
    desc: '项目符号列表',
    icon: <List className="size-4" />,
    keywords: ['ul', 'list', '无序'],
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ordered',
    label: '有序列表',
    desc: '数字编号列表',
    icon: <ListOrdered className="size-4" />,
    keywords: ['ol', '有序'],
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'todo',
    label: '任务列表',
    desc: '待办勾选框',
    icon: <CheckSquare className="size-4" />,
    keywords: ['task', 'todo', 'check', '待办'],
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    key: 'quote',
    label: '引用块',
    desc: '引用文字',
    icon: <Quote className="size-4" />,
    keywords: ['blockquote', '引用'],
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'code',
    label: '代码块',
    desc: '多行代码',
    icon: <Braces className="size-4" />,
    keywords: ['codeblock', '代码块'],
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    key: 'inline-code',
    label: '行内代码',
    desc: '单行短代码',
    icon: <Code2 className="size-4" />,
    keywords: ['inline', '行内'],
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    key: 'divider',
    label: '分隔线',
    desc: '水平分隔线',
    icon: <Minus className="size-4" />,
    keywords: ['hr', 'divider', '分隔线'],
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    key: 'image',
    label: '图片',
    desc: '插入本地或外链图片',
    icon: <ImageIcon className="size-4" />,
    keywords: ['img', 'image', '图片'],
    run: () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/webp,image/gif'
      input.multiple = true
      input.click()
    },
  },
]

interface SlashMenuProps {
  editor: Editor | null
  onInsertImageFiles?: (files: File[]) => void
}

export function SlashMenu({ editor, onInsertImageFiles }: SlashMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [active, setActive] = useState(0)
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement
    const onStart = () => setIsComposing(true)
    const onEnd = () => setIsComposing(false)
    el.addEventListener('compositionstart', onStart)
    el.addEventListener('compositionend', onEnd)
    return () => {
      el.removeEventListener('compositionstart', onStart)
      el.removeEventListener('compositionend', onEnd)
    }
  }, [editor])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SLASH_ITEMS
    return SLASH_ITEMS.filter((item) => {
      if (item.key.toLowerCase().includes(q)) return true
      if (item.label.toLowerCase().includes(q)) return true
      if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return true
      return false
    })
  }, [query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!editor) return
    const handler = () => {
      if (isComposing) {
        setOpen(false)
        return
      }
      const { state } = editor
      const { from, empty } = state.selection
      if (!empty) {
        setOpen(false)
        return
      }
      const resolved = state.doc.resolve(from)
      const nodeBefore = resolved.nodeBefore
      if (!nodeBefore || nodeBefore.type.name !== 'text' || typeof nodeBefore.text !== 'string') {
        setOpen(false)
        return
      }
      const text = nodeBefore.text
      const slashIdx = text.lastIndexOf('/')
      if (slashIdx < 0) {
        setOpen(false)
        return
      }
      const between = text.slice(slashIdx + 1)
      if (/\s/.test(between)) {
        setOpen(false)
        return
      }
      const rangeFrom = from - text.length + slashIdx
      const rangeTo = from
      setSlashRange({ from: rangeFrom, to: rangeTo })
      setQuery(between)
      const coords = editor.view.coordsAtPos(from)
      setPos({ top: coords.bottom + 6 + window.scrollY, left: coords.left })
      setOpen(true)
    }
    editor.on('selectionUpdate', handler)
    editor.on('transaction', handler)
    return () => {
      editor.off('selectionUpdate', handler)
      editor.off('transaction', handler)
    }
  }, [editor, isComposing])

  const runItem = useCallback((item: SlashItem) => {
    if (!editor || !slashRange) return
    const chain = editor.chain().focus().insertContentAt(slashRange, '')
    chain.run()
    if (item.key === 'image') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/webp,image/gif'
      input.multiple = true
      input.onchange = () => {
        const files = Array.from(input.files ?? [])
        if (files.length > 0) onInsertImageFiles?.(files)
      }
      input.click()
    } else {
      item.run(editor)
    }
    setOpen(false)
  }, [editor, slashRange, onInsertImageFiles])

  useEffect(() => {
    if (!editor || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((v) => (v + 1) % Math.max(1, items.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((v) => (v - 1 + Math.max(1, items.length)) % Math.max(1, items.length))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[active]) {
          e.preventDefault()
          runItem(items[active])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editor, open, items, active, runItem])

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.children[active] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  if (!open || !pos || !editor) return null

  return (
    <div
      className={cn(
        'pointer-events-auto fixed z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-lg shadow-black/10 backdrop-blur-sm',
        'animate-in fade-in zoom-in-95 duration-100',
      )}
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
        {query ? `搜索：${query}` : '输入斜杠命令，↑↓ 选择，Enter 确认'}
      </div>
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto p-1"
        role="listbox"
      >
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">无匹配结果</div>
        ) : (
          items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
              onClick={() => runItem(item)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
                {item.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="truncate text-xs text-muted-foreground">{item.desc}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
