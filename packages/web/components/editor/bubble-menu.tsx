'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Code, Italic, Link2, MessageSquarePlus, Strikethrough,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BubbleMenuProps {
  editor: Editor | null
  onAnnotation?: () => void
}

export function BubbleMenu({ editor, onAnnotation }: BubbleMenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [isComposing, setIsComposing] = useState(false)

  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom as HTMLElement

    const onCompositionStart = () => setIsComposing(true)
    const onCompositionEnd = () => setIsComposing(false)

    el.addEventListener('compositionstart', onCompositionStart)
    el.addEventListener('compositionend', onCompositionEnd)
    return () => {
      el.removeEventListener('compositionstart', onCompositionStart)
      el.removeEventListener('compositionend', onCompositionEnd)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const update = () => {
      if (isComposing) {
        setPos(null)
        return
      }
      const { state, view } = editor
      const { from, to, empty } = state.selection
      if (empty || from === to) {
        setPos(null)
        return
      }
      const dom = view.domAtPos(from).node as HTMLElement
      if (!dom || !dom.closest) {
        setPos(null)
        return
      }
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)
      const top = Math.max(start.top, end.top) - 52
      const left = (start.left + end.left) / 2
      if (top < 0 || left < 0) {
        setPos(null)
        return
      }
      setPos({ top: top + window.scrollY, left })
    }
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor, isComposing])

  if (!editor || !pos) return null

  const setLink = () => {
    const href = editor.getAttributes('link').href as string | undefined
    const next = window.prompt('链接地址', href ?? 'https://')
    if (next === null) return
    if (!next.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: next.trim() }).run()
  }

  return (
    <div
      className={cn(
        'pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg shadow-black/10 backdrop-blur-sm',
        'animate-in fade-in zoom-in-95 duration-100',
      )}
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Button
        type="button"
        variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
        size="icon"
        className="size-7"
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="粗体"
        aria-label="粗体"
      >
        <Bold className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
        size="icon"
        className="size-7"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体"
        aria-label="斜体"
      >
        <Italic className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('strike') ? 'secondary' : 'ghost'}
        size="icon"
        className="size-7"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线"
        aria-label="删除线"
      >
        <Strikethrough className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('code') ? 'secondary' : 'ghost'}
        size="icon"
        className="size-7"
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码"
        aria-label="行内代码"
      >
        <Code className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('link') ? 'secondary' : 'ghost'}
        size="icon"
        className="size-7"
        onClick={setLink}
        title="链接"
        aria-label="链接"
      >
        <Link2 className="size-3.5" />
      </Button>
      {onAnnotation && (
        <>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-primary"
            onClick={onAnnotation}
            title="对选中文字写想法"
            aria-label="写想法"
          >
            <MessageSquarePlus className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}
