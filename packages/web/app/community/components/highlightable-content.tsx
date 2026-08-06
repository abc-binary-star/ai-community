'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, MessageSquare, MessageSquarePlus, Share2, Trash2 } from 'lucide-react'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import type { AnnotationAnchorCount, Highlight } from 'shared'
import {
  applyHighlights,
  getSelectionContext,
  getBlockText,
  type SelectionContext,
} from '@/lib/highlight-dom'
import { useAnnotationsQuery } from '@/lib/use-annotations'
import { isAnnotationsEnabled } from '@/lib/feature-flags'
import { toast } from 'sonner'
import { AnnotationPanel } from './annotation-panel'
import type { AnnotationDraft } from './annotation-editor'

const COLOR_OPTIONS = [
  { key: 'yellow', cls: 'bg-yellow-300' },
  { key: 'green', cls: 'bg-green-300' },
  { key: 'blue', cls: 'bg-blue-300' },
]

interface Props {
  postId: string
  content: string
  fontFamily?: string
}

interface PanelState {
  anchor: string
  quote: string
}

// 稳定空引用：避免 `?? []` 每次渲染生成新数组，导致 effect 依赖变化引发循环
const EMPTY_HIGHLIGHTS: Highlight[] = []
const EMPTY_ANCHOR_COUNTS: AnnotationAnchorCount[] = []

export function HighlightableContent({ postId, content, fontFamily }: Props) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const hydrated = useHydrated()
  const isLoggedIn = hydrated && !!token
  const annotationsEnabled = isAnnotationsEnabled()
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null)
  const [pending, setPending] = useState<SelectionContext | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // 段落想法面板与编辑器草稿
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [draft, setDraft] = useState<AnnotationDraft | null>(null)
  // 段落数量徽章位置（正文外侧浮动）
  const [badges, setBadges] = useState<{ anchor: string; top: number; count: number }[]>([])
  // 桌面端 hover 段落时的写想法图标
  const [hover, setHover] = useState<{ anchor: string; top: number; snapshot: string } | null>(null)

  const highlightsQuery = useQuery({
    queryKey: ['highlights', postId],
    queryFn: () => api.get<{ items: Highlight[] }>(`/posts/${postId}/highlights`),
    enabled: isLoggedIn,
  })
  const highlights = highlightsQuery.data?.items ?? EMPTY_HIGHLIGHTS

  // 想法列表 + 各段落公开计数（访客也可见公开想法）
  const annotationsQuery = useAnnotationsQuery(postId)
  const anchorCounts = annotationsQuery.data?.anchorCounts ?? EMPTY_ANCHOR_COUNTS
  const countMap = useMemo(() => new Map(anchorCounts.map((c) => [c.anchor, c.count])), [anchorCounts])

  // 渲染高亮（内容或划线数据变化时），用 useLayoutEffect 在 paint 前应用避免闪烁
  useLayoutEffect(() => {
    if (containerRef.current) applyHighlights(containerRef.current, highlights)
  }, [highlights, content])

  // 计算有想法的段落数量徽章位置（正文外侧，不挤压正文宽度）
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const containerTop = container.getBoundingClientRect().top
    const next: { anchor: string; top: number; count: number }[] = []
    container.querySelectorAll('[data-block-anchor]').forEach((el) => {
      const block = el as HTMLElement
      const anchor = block.getAttribute('data-block-anchor') || ''
      const count = countMap.get(anchor) || 0
      if (count > 0) {
        next.push({ anchor, top: block.getBoundingClientRect().top - containerTop, count })
      }
    })
    setBadges((prev) => {
      if (
        prev.length === next.length &&
        prev.every((b, i) => b.anchor === next[i].anchor && b.top === next[i].top && b.count === next[i].count)
      ) {
        return prev
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, countMap, highlights])

  // 选区监听：选中块内文本时弹出工具条
  useEffect(() => {
    const onSelectionChange = () => {
      const container = containerRef.current
      if (!container) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null)
        setToolbar(null)
        return
      }
      const info = getSelectionContext(container)
      if (!info) {
        setPending(null)
        setToolbar(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      setPending(info)
      setToolbar({ x: rect.left + rect.width / 2, y: rect.top })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  const dismissToolbar = () => {
    window.getSelection()?.removeAllRanges()
    setPending(null)
    setToolbar(null)
  }

  // 段落 hover：桌面端显示写想法图标
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const block = target.closest('[data-block-anchor]') as HTMLElement | null
      if (!block) {
        setHover(null)
        return
      }
      const anchor = block.getAttribute('data-block-anchor') || ''
      const top = block.getBoundingClientRect().top - container.getBoundingClientRect().top
      setHover((prev) =>
        prev && prev.anchor === anchor ? prev : { anchor, top, snapshot: getBlockText(block).trim() },
      )
    }
    const onLeave = () => setHover(null)
    container.addEventListener('mouseover', onMove)
    container.addEventListener('mouseleave', onLeave)
    return () => {
      container.removeEventListener('mouseover', onMove)
      container.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const requireLogin = () => {
    if (!isLoggedIn) {
      const path = window.location.pathname + window.location.search
      router.push(`/login?redirect=${encodeURIComponent(path)}`)
      return false
    }
    return true
  }

  // 选区工具条「写想法」：以选区为对象创建想法并打开面板
  const openSelectionPanel = () => {
    if (!annotationsEnabled || !pending || !requireLogin()) {
      dismissToolbar()
      return
    }
    setDraft({
      scope: 'selection',
      anchor: pending.anchor,
      startOffset: pending.startOffset,
      endOffset: pending.endOffset,
      selectedText: pending.text,
      prefix: pending.prefix,
      suffix: pending.suffix,
      paragraphSnapshot: pending.paragraphSnapshot,
    })
    setPanel({ anchor: pending.anchor, quote: pending.paragraphSnapshot })
    dismissToolbar()
  }

  // 整段入口：以整段为对象创建想法并打开面板
  const openParagraphPanel = (anchor: string, snapshot: string) => {
    if (!annotationsEnabled || !requireLogin()) return
    setDraft({
      scope: 'paragraph',
      anchor,
      startOffset: 0,
      endOffset: 0,
      selectedText: snapshot,
      paragraphSnapshot: snapshot,
    })
    setPanel({ anchor, quote: snapshot })
  }

  const openPanelView = (anchor: string, snapshot: string) => {
    setDraft(null)
    setPanel({ anchor, quote: snapshot })
  }

  const closePanel = () => {
    setPanel(null)
    setDraft(null)
  }

  const createHighlight = async (color: string) => {
    if (!pending) return
    try {
      await api.post(`/posts/${postId}/highlights`, {
        anchor: pending.anchor,
        startOffset: pending.startOffset,
        endOffset: pending.endOffset,
        selectedText: pending.text,
        color,
      })
      qc.invalidateQueries({ queryKey: ['highlights', postId] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '划线失败')
    }
    dismissToolbar()
  }

  const updateColor = async (id: string, color: string) => {
    try {
      await api.put(`/posts/${postId}/highlights/${id}`, { color })
      qc.invalidateQueries({ queryKey: ['highlights', postId] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '修改失败')
    }
    setMenu(null)
  }

  const deleteHighlight = async (id: string) => {
    try {
      await api.del(`/posts/${postId}/highlights/${id}`)
      qc.invalidateQueries({ queryKey: ['highlights', postId] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
    setMenu(null)
  }

  const copySelection = async () => {
    if (pending) {
      try {
        await navigator.clipboard?.writeText(pending.text)
        toast.success('已复制')
      } catch {
        toast.error('复制失败')
      }
    }
    dismissToolbar()
  }

  const shareSelection = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const shareData = { title: '社区划线', text: pending?.text, url }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard?.writeText(`${pending?.text}\n${url}`)
        toast.success('链接已复制')
      }
    } catch {
      // 用户取消分享时不提示
    }
    dismissToolbar()
  }

  // 点击高亮 mark 弹出改色/删除菜单；点击其他位置关闭菜单
  useEffect(() => {
    const container = containerRef.current
    if (!container || !isLoggedIn) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const mark = target.closest('mark[data-highlight-id]') as HTMLElement | null
      if (mark) {
        e.preventDefault()
        e.stopPropagation()
        const id = mark.getAttribute('data-highlight-id')
        if (id) {
          const rect = mark.getBoundingClientRect()
          setMenu({ id, x: rect.left + rect.width / 2, y: rect.bottom })
        }
      } else {
        setMenu(null)
      }
    }
    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, postId])

  return (
    <div className="relative">
      <MarkdownRenderer ref={containerRef} content={content} fontFamily={fontFamily} enableBlocks />

      {/* 段落公开想法数量徽章（正文外侧浮动） */}
      {annotationsEnabled && badges.map((b) => (
        <button
          key={b.anchor}
          onClick={(e) => {
            e.stopPropagation()
            openPanelView(b.anchor, '')
          }}
          className="absolute right-0 z-10 -translate-y-1/2 translate-x-full pl-1"
          style={{ top: b.top + 14 }}
          aria-label="查看段落想法"
        >
          <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm hover:bg-muted">
            <MessageSquare className="size-3" />
            {b.count > 99 ? '99+' : b.count}
          </span>
        </button>
      ))}

      {/* 桌面端 hover 段落写想法图标 */}
      {annotationsEnabled && hover && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            openParagraphPanel(hover.anchor, hover.snapshot)
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute right-0 z-10 -translate-y-1/2 translate-x-full pl-1 text-muted-foreground transition-opacity hover:text-foreground"
          style={{ top: hover.top + 14 }}
          aria-label="对这一段写想法"
        >
          <span className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-popover shadow-sm hover:bg-muted">
            <MessageSquarePlus className="size-3.5" />
          </span>
        </button>
      )}

      {toolbar && pending && (
        <div
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
          style={{ left: toolbar.x, top: toolbar.y - 8 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.key}
              onClick={() => createHighlight(c.key)}
              className={`size-6 rounded-full border border-black/10 ${c.cls} hover:scale-110 transition-transform`}
              aria-label="划线"
            />
          ))}
          <div className="mx-0.5 h-5 w-px bg-border" />
          {annotationsEnabled && (
            <button onClick={openSelectionPanel} className="rounded p-1.5 hover:bg-muted" aria-label="写想法" title="写想法">
              <MessageSquarePlus className="size-4" />
            </button>
          )}
          <button onClick={copySelection} className="rounded p-1.5 hover:bg-muted" aria-label="复制">
            <Copy className="size-4" />
          </button>
          <button onClick={shareSelection} className="rounded p-1.5 hover:bg-muted" aria-label="分享">
            <Share2 className="size-4" />
          </button>
        </div>
      )}
      {menu && (
        <div
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-md"
          style={{ left: menu.x, top: menu.y + 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.key}
              onClick={() => updateColor(menu.id, c.key)}
              className={`size-6 rounded-full border border-black/10 ${c.cls} hover:scale-110 transition-transform`}
              aria-label="改色"
            />
          ))}
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button
            onClick={() => deleteHighlight(menu.id)}
            className="rounded p-1.5 text-destructive hover:bg-muted"
            aria-label="删除"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
      {isLoggedIn && highlights.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Trash2 className="size-3" />
          点击高亮文字可改色或删除
        </p>
      )}

      {annotationsEnabled && panel && (
        <AnnotationPanel
          postId={postId}
          anchor={panel.anchor}
          quote={panel.quote}
          initialDraft={draft}
          currentUserId={currentUserId}
          onClose={closePanel}
        />
      )}

    </div>
  )
}
