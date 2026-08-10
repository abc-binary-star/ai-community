'use client'

import { useEffect, useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { AlignJustify, ChevronRight, Hash, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BLOCK_ID_ATTR } from '@/lib/block-id'
import type { OutlineHeading } from '@/lib/block-id'
import { blocksToOutline, extractBlocksFromDoc, markdownHeadingsToOutline } from '@/lib/block-id'

interface OutlineViewProps {
  editor?: Editor | null
  doc?: JSONContent | null
  markdown?: string
  containerSelector?: string
  className?: string
  activeBlockId?: string | null
  onActiveChange?: (blockId: string | null) => void
  floating?: boolean
  defaultOpen?: boolean
}

export function OutlineView({
  editor,
  doc,
  markdown,
  containerSelector,
  className,
  activeBlockId,
  onActiveChange,
  floating = false,
  defaultOpen = true,
}: OutlineViewProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [activeId, setActiveId] = useState<string | null>(activeBlockId ?? null)

  useEffect(() => {
    if (activeBlockId !== undefined) setActiveId(activeBlockId)
  }, [activeBlockId])

  const headings = useMemo<OutlineHeading[]>(() => {
    if (editor) {
      const json = editor.getJSON()
      return blocksToOutline(extractBlocksFromDoc(json))
    }
    if (doc) return blocksToOutline(extractBlocksFromDoc(doc))
    if (markdown) return markdownHeadingsToOutline(markdown)
    return []
  }, [editor, doc, markdown])

  useEffect(() => {
    if (!open) return
    const getContainer = () => {
      if (containerSelector) return document.querySelector(containerSelector) as HTMLElement | null
      if (editor) return editor.view.dom as HTMLElement
      return null
    }
    const handler = () => {
      const container = getContainer()
      if (!container) return
      const blocks = Array.from(container.querySelectorAll<HTMLElement>(`[${BLOCK_ID_ATTR}]`))
      if (blocks.length === 0) return
      const top = window.scrollY + 120
      let current: OutlineHeading | null = null
      for (const h of headings) {
        const el = blocks.find((b) => b.getAttribute(BLOCK_ID_ATTR) === h.blockId)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top + window.scrollY <= top) {
          current = h
        } else {
          break
        }
      }
      const next = current?.blockId ?? headings[0]?.blockId ?? null
      if (next !== activeId) {
        setActiveId(next)
        onActiveChange?.(next)
      }
    }
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler)
      window.removeEventListener('resize', handler)
    }
  }, [headings, open, editor, containerSelector, activeId, onActiveChange])

  const scrollTo = (blockId: string) => {
    const container = containerSelector
      ? (document.querySelector(containerSelector) as HTMLElement | null)
      : editor
        ? (editor.view.dom as HTMLElement)
        : null
    const el = container?.querySelector<HTMLElement>(`[${BLOCK_ID_ATTR}="${blockId}"]`)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ top, behavior: 'smooth' })
      setActiveId(blockId)
      onActiveChange?.(blockId)
    }
  }

  if (headings.length === 0) {
    if (floating) return null
    return (
      <div className={cn('rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground', className)}>
        <Hash className="mx-auto mb-2 size-5 opacity-50" />
        添加标题后，这里会显示文章大纲
      </div>
    )
  }

  const minLevel = Math.min(...headings.map((h) => h.level))

  const content = (
    <div className="space-y-0.5">
      {headings.map((h) => (
        <button
          key={h.blockId}
          type="button"
          onClick={() => scrollTo(h.blockId)}
          className={cn(
            'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
            activeId === h.blockId
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          style={{ paddingLeft: `${(h.level - minLevel) * 12 + 8}px` }}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform',
              activeId === h.blockId ? 'rotate-90 text-primary' : 'text-muted-foreground/50 group-hover:rotate-90',
            )}
          />
          <span className="truncate">{h.text}</span>
        </button>
      ))}
    </div>
  )

  if (!floating) {
    return (
      <div className={cn('rounded-lg border border-border bg-card p-2', className)}>
        <div className="mb-2 flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AlignJustify className="size-3.5" />
            大纲
          </div>
          <div className="text-[10px] text-muted-foreground">{headings.length} 个标题</div>
        </div>
        {content}
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed right-4 top-1/2 z-40 size-10 -translate-y-1/2 shadow-lg md:right-6"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? '关闭大纲' : '打开大纲'}
        title={open ? '关闭大纲' : '文章大纲'}
      >
        <AlignJustify className="size-4" />
      </Button>
      {open && (
        <div
          className={cn(
            'fixed right-4 top-1/2 z-40 w-60 -translate-y-1/2 rounded-lg border border-border bg-card/95 p-3 shadow-xl backdrop-blur-sm md:right-6',
            'animate-in fade-in slide-in-from-right duration-200',
            className,
          )}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <AlignJustify className="size-3.5" />
              大纲 · {headings.length}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {content}
        </div>
      )}
    </>
  )
}
