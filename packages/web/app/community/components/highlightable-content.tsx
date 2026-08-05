'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Share2, Trash2 } from 'lucide-react'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import type { Highlight } from 'shared'
import { applyHighlights, getSelectionInBlock, type SelectionInfo } from '@/lib/highlight-dom'
import { toast } from 'sonner'

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

export function HighlightableContent({ postId, content, fontFamily }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const isLoggedIn = hydrated && !!token
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null)
  const [pending, setPending] = useState<SelectionInfo | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const highlightsQuery = useQuery({
    queryKey: ['highlights', postId],
    queryFn: () => api.get<{ items: Highlight[] }>(`/posts/${postId}/highlights`),
    enabled: isLoggedIn,
  })
  const highlights = highlightsQuery.data?.items ?? []

  // 渲染高亮（内容或划线数据变化时），用 useLayoutEffect 在 paint 前应用避免闪烁
  useLayoutEffect(() => {
    if (containerRef.current) applyHighlights(containerRef.current, highlights)
  }, [highlights, content])

  // 选区监听：选中块内文本时弹出工具条
  useEffect(() => {
    if (!isLoggedIn) return
    const onSelectionChange = () => {
      const container = containerRef.current
      if (!container) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null)
        setToolbar(null)
        return
      }
      const info = getSelectionInBlock(container)
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
  }, [isLoggedIn])

  const dismissToolbar = () => {
    window.getSelection()?.removeAllRanges()
    setPending(null)
    setToolbar(null)
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
    </div>
  )
}
