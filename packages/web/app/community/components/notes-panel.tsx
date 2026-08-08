'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Highlighter, ListOrdered, Lock, MessageSquare, Notebook, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AnnotationList, Highlight } from 'shared'
import { toast } from 'sonner'

interface NotesPanelProps {
  postId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

interface NoteItem {
  key: string
  kind: 'highlight' | 'annotation'
  anchor: string
  selectedText: string
  color: string
  body: string
  anchorStatus: string
  visibility: string
  createdAt: string
}

type SortMode = 'time' | 'position'

const HIGHLIGHT_BG: Record<string, string> = {
  yellow: 'bg-yellow-300/40',
  green: 'bg-green-300/40',
  blue: 'bg-blue-300/40',
}

export function NotesPanel({ postId, containerRef, onClose }: NotesPanelProps) {
  const [sortMode, setSortMode] = useState<SortMode>('time')

  const highlightsQuery = useQuery({
    queryKey: ['highlights', postId],
    queryFn: () => api.get<{ items: Highlight[] }>(`/posts/${postId}/highlights`),
  })
  const annotationsQuery = useQuery({
    queryKey: ['post-my-annotations', postId],
    queryFn: () =>
      api.get<AnnotationList>(`/posts/${postId}/annotations?mine=1`),
  })

  const items = useMemo<NoteItem[]>(() => {
    const highlights: NoteItem[] = (highlightsQuery.data?.items ?? []).map((h) => ({
      key: `h-${h.id}`,
      kind: 'highlight',
      anchor: h.anchor,
      selectedText: h.selectedText,
      color: h.color,
      body: '',
      anchorStatus: 'attached',
      visibility: '',
      createdAt: h.createdAt,
    }))
    const annotations: NoteItem[] = (annotationsQuery.data?.items ?? []).map((a) => ({
      key: `a-${a.id}`,
      kind: 'annotation',
      anchor: a.anchor,
      selectedText: a.selectedText,
      color: '',
      body: a.body,
      anchorStatus: a.anchorStatus,
      visibility: a.visibility,
      createdAt: a.createdAt,
    }))
    return [...highlights, ...annotations]
  }, [highlightsQuery.data, annotationsQuery.data])

  const isLoading = highlightsQuery.isLoading || annotationsQuery.isLoading
  const highlightCount = highlightsQuery.data?.items?.length ?? 0
  const annotationCount = annotationsQuery.data?.items?.length ?? 0

  const sorted = useMemo(() => {
    const list = [...items]
    if (sortMode === 'time') {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return list
    }
    const order = new Map<string, number>()
    containerRef.current?.querySelectorAll('[data-block-anchor]').forEach((el, i) => {
      const anchor = el.getAttribute('data-block-anchor')
      if (anchor && !order.has(anchor)) order.set(anchor, i)
    })
    list.sort((a, b) => {
      const pa = order.get(a.anchor) ?? Number.MAX_SAFE_INTEGER
      const pb = order.get(b.anchor) ?? Number.MAX_SAFE_INTEGER
      if (pa !== pb) return pa - pb
      return b.createdAt.localeCompare(a.createdAt)
    })
    return list
  }, [items, sortMode, containerRef])

  const jumpTo = (note: NoteItem) => {
    const container = containerRef.current
    if (!container) {
      toast.error('无法定位原文段落')
      return
    }
    let target = container.querySelector<HTMLElement>(
      `[data-block-anchor="${CSS.escape(note.anchor)}"]`,
    )
    if (!target) {
      for (const el of Array.from(
        container.querySelectorAll<HTMLElement>('[data-block-anchor]'),
      )) {
        if (note.selectedText && el.textContent?.includes(note.selectedText)) {
          target = el
          break
        }
      }
    }
    if (!target) {
      toast.error('原文段落已变更，无法定位')
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.style.transition = 'background-color 0.6s'
    target.style.backgroundColor = 'rgba(250, 204, 21, 0.28)'
    window.setTimeout(() => {
      target.style.backgroundColor = ''
    }, 1600)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-background shadow-xl">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Notebook className="size-4 text-primary" />
          <h2 className="text-base font-semibold">我的笔记</h2>
          <span className="text-xs text-muted-foreground">
            {highlightCount} 划线 · {annotationCount} 想法
          </span>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 border-b border-border px-4 py-2">
          <Button
            variant={sortMode === 'time' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortMode('time')}
          >
            <Clock className="size-3.5" />
            最新
          </Button>
          <Button
            variant={sortMode === 'position' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortMode('position')}
          >
            <ListOrdered className="size-3.5" />
            按位置
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              还没有笔记，阅读时划线或写想法会出现在这里
            </div>
          ) : (
            sorted.map((note) => (
              <NoteCard key={note.key} note={note} onJump={jumpTo} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function NoteCard({ note, onJump }: { note: NoteItem; onJump: (note: NoteItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onJump(note)}
      className="block w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {note.kind === 'highlight' ? (
          <>
            <Highlighter className="size-3" />
            划线
          </>
        ) : (
          <>
            <MessageSquare className="size-3" />
            想法
            {note.visibility === 'private' && <Lock className="size-3" />}
            {note.anchorStatus === 'orphaned' && (
              <span className="text-amber-600">原文已变更</span>
            )}
          </>
        )}
        <span className="ml-auto">{formatRelativeTime(note.createdAt)}</span>
      </div>
      {note.kind === 'highlight' ? (
        <p
          className={cn(
            'mt-1.5 rounded px-1.5 py-0.5 text-sm leading-6 text-foreground/90',
            HIGHLIGHT_BG[note.color] ?? HIGHLIGHT_BG.yellow,
          )}
        >
          {note.selectedText}
        </p>
      ) : (
        <>
          {note.selectedText && (
            <p className="mt-1.5 line-clamp-2 border-l-2 border-primary/30 pl-2 text-xs italic leading-5 text-muted-foreground">
              {note.selectedText}
            </p>
          )}
          <p className="mt-1.5 text-sm leading-6 text-foreground/90">{note.body}</p>
        </>
      )}
    </button>
  )
}
