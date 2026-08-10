'use client'

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Braces, ChevronDown, ChevronUp, Code, FileText, Heading2, Image as ImageIcon,
  Italic, Link2, List, ListChecks, ListOrdered, Mic, Quote, Slash, Sparkles,
  Strikethrough, Type, Undo2, Redo2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function useVirtualKeyboard(containerRef: React.RefObject<HTMLElement | null>) {
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [safeAreaBottom, setSafeAreaBottom] = useState(0)
  const lastFocusRef = useRef(0)

  useEffect(() => {
    const root = document.documentElement
    const getSafe = () => {
      const raw = getComputedStyle(root).getPropertyValue('--sat') || ''
      const m = raw.match(/(\d+(?:\.\d+)?)/)
      if (m) return parseFloat(m[1])
      if (typeof window !== 'undefined' && 'visualViewport' in window) {
        const vv = window.visualViewport
        if (vv) {
          const diff = window.innerHeight - vv.height
          if (diff > 0) return 0
        }
      }
      return 0
    }
    setSafeAreaBottom(getSafe())
    const onResize = () => setSafeAreaBottom(getSafe())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onFocusIn = () => {
      lastFocusRef.current = Date.now()
    }
    const detect = () => {
      if (typeof window === 'undefined') return
      if ('visualViewport' in window) {
        const vv = window.visualViewport
        if (vv) {
          const diff = window.innerHeight - vv.height
          if (diff > 120) {
            setKeyboardOpen(true)
            setKeyboardHeight(diff)
            return
          }
        }
      }
      if (Date.now() - lastFocusRef.current < 500) {
        const el = document.activeElement as HTMLElement | null
        if (el && containerRef.current?.contains(el)) {
          setKeyboardOpen(true)
          setKeyboardHeight(Math.max(260, safeAreaBottom + 260))
          return
        }
      }
      setKeyboardOpen(false)
      setKeyboardHeight(0)
    }
    detect()
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('resize', detect)
    if ('visualViewport' in window) {
      window.visualViewport?.addEventListener('resize', detect)
    }
    const timer = window.setInterval(detect, 1000)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('resize', detect)
      window.visualViewport?.removeEventListener('resize', detect)
      window.clearInterval(timer)
    }
  }, [containerRef, safeAreaBottom])

  return { keyboardOpen, keyboardHeight, safeAreaBottom }
}

interface MobileToolbarProps {
  editor: Editor | null
  onImage?: () => void
  onPolish?: () => void
  polishing?: boolean
  onOpenMore?: () => void
  onInsertDocx?: () => void
  onVoiceInput?: () => void
  onOpenInsertSheet?: () => void
}

interface InsertSheetProps {
  open: boolean
  onClose: () => void
  onImage: () => void
  onDocx: () => void
  onVoice: () => void
  onSlash: () => void
}

export function MobileInsertSheet({ open, onClose, onImage, onDocx, onVoice, onSlash }: InsertSheetProps) {
  if (!open) return null
  const items = [
    { key: 'image', label: '插入图片', icon: <ImageIcon className="size-6" />, onClick: onImage, desc: '相册或拍照' },
    { key: 'docx', label: '导入 Word', icon: <FileText className="size-6" />, onClick: onDocx, desc: '.docx 文档' },
    { key: 'voice', label: '语音输入', icon: <Mic className="size-6" />, onClick: onVoice, desc: '说一句再润色' },
    { key: 'slash', label: '斜杠命令', icon: <Slash className="size-6" />, onClick: onSlash, desc: '标题 / 列表 / 代码' },
  ]
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-border bg-background pb-[max(env(safe-area-inset-bottom),8px)] shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-3 pt-3">
          <div className="text-xs font-medium text-muted-foreground">插入</div>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} title="关闭" aria-label="关闭">
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1 px-2 py-3">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => { item.onClick(); onClose() }}
              className="flex flex-col items-center justify-center gap-1 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/70"
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-accent/50 text-primary">
                {item.icon}
              </div>
              <div className="text-xs font-medium text-foreground">{item.label}</div>
              <div className="text-[10px] leading-none text-muted-foreground">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function MobileToolbar({
  editor,
  onImage,
  onPolish,
  polishing,
  onOpenMore,
  onInsertDocx,
  onVoiceInput,
  onOpenInsertSheet,
}: MobileToolbarProps) {
  const [expanded, setExpanded] = useState(false)
  if (!editor) return null

  const primary = [
    {
      key: 'bold',
      icon: <Bold className="size-5" />,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
      label: '粗体',
    },
    {
      key: 'italic',
      icon: <Italic className="size-5" />,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
      label: '斜体',
    },
    {
      key: 'strike',
      icon: <Strikethrough className="size-5" />,
      active: editor.isActive('strike'),
      run: () => editor.chain().focus().toggleStrike().run(),
      label: '删除线',
    },
    {
      key: 'code',
      icon: <Code className="size-5" />,
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
      label: '行内代码',
    },
  ]

  const secondary = [
    {
      key: 'h2',
      icon: <Heading2 className="size-5" />,
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      label: '标题',
    },
    {
      key: 'bullet',
      icon: <List className="size-5" />,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
      label: '无序',
    },
    {
      key: 'ordered',
      icon: <ListOrdered className="size-5" />,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
      label: '有序',
    },
    {
      key: 'todo',
      icon: <ListChecks className="size-5" />,
      active: editor.isActive('taskList'),
      run: () => editor.chain().focus().toggleTaskList().run(),
      label: '待办',
    },
    {
      key: 'quote',
      icon: <Quote className="size-5" />,
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
      label: '引用',
    },
    {
      key: 'codeblock',
      icon: <Braces className="size-5" />,
      active: editor.isActive('codeBlock'),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
      label: '代码块',
    },
    {
      key: 'link',
      icon: <Link2 className="size-5" />,
      active: editor.isActive('link'),
      run: () => {
        const current = editor.getAttributes('link').href as string | undefined
        const href = window.prompt('链接地址', current ?? 'https://')
        if (href === null) return
        if (!href.trim()) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
          return
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
      },
      label: '链接',
    },
  ]

  return (
    <div className={cn(
      'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm transition-transform md:hidden',
      'animate-in slide-in-from-bottom duration-300',
    )}>
      <div className="flex items-center justify-between gap-1 border-b border-border/50 px-1 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="撤销"
          aria-label="撤销"
        >
          <Undo2 className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="重做"
          aria-label="重做"
        >
          <Redo2 className="size-5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        {primary.map((a) => (
          <Button
            key={a.key}
            type="button"
            variant={a.active ? 'secondary' : 'ghost'}
            size="icon"
            className="size-10 shrink-0"
            onClick={a.run}
            title={a.label}
            aria-label={a.label}
          >
            {a.icon}
          </Button>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {onOpenInsertSheet ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={onOpenInsertSheet}
              title="插入"
              aria-label="插入"
            >
              <ImageIcon className="size-5" />
            </Button>
          ) : onImage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={onImage}
              title="插入图片"
              aria-label="插入图片"
            >
              <ImageIcon className="size-5" />
            </Button>
          ) : null}
          {onInsertDocx && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={onInsertDocx}
              title="导入 Word"
              aria-label="导入 Word"
            >
              <FileText className="size-5" />
            </Button>
          )}
          {onVoiceInput && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={onVoiceInput}
              title="语音输入"
              aria-label="语音输入"
            >
              <Mic className="size-5" />
            </Button>
          )}
          {onPolish && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-10 text-primary', polishing && 'animate-pulse')}
              onClick={onPolish}
              disabled={polishing}
              title="AI 润色"
              aria-label="AI 润色"
            >
              <Sparkles className="size-5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-10 transition-transform', expanded && 'rotate-180')}
            onClick={() => { onOpenMore?.(); setExpanded((v) => !v) }}
            title={expanded ? '收起更多工具' : '展开更多工具'}
            aria-label={expanded ? '收起更多工具' : '展开更多工具'}
          >
            {expanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="grid grid-cols-4 gap-1 px-1 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {secondary.map((a) => (
            <Button
              key={a.key}
              type="button"
              variant={a.active ? 'secondary' : 'ghost'}
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-md"
              onClick={a.run}
              title={a.label}
              aria-label={a.label}
            >
              {a.icon}
              <span className="text-[10px] text-muted-foreground">{a.label}</span>
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-md"
            onClick={() => {
              editor.chain().focus().insertContent('/').run()
              onOpenMore?.()
            }}
            title="斜杠命令"
            aria-label="斜杠命令"
          >
            <Slash className="size-5" />
            <span className="text-[10px] text-muted-foreground">/命令</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-md"
            onClick={() => editor.chain().focus().setParagraph().run()}
            title="正文"
            aria-label="正文"
          >
            <Type className="size-5" />
            <span className="text-[10px] text-muted-foreground">正文</span>
          </Button>
        </div>
      )}
    </div>
  )
}
