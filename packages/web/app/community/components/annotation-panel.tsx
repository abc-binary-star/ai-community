'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MessageSquarePlus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { annotationsKey } from '@/lib/use-annotations'
import type { AnnotationList } from 'shared'
import { AnnotationItem } from './annotation-item'
import { AnnotationEditor, type AnnotationDraft } from './annotation-editor'

type Sort = 'hot' | 'latest'

interface Props {
  postId: string
  anchor: string
  quote: string
  initialDraft: AnnotationDraft | null
  currentUserId?: string
  onClose: () => void
}

// 段落想法面板：桌面固定右侧栏 / 移动端底部抽屉。
// 列表按 anchor 过滤，支持热门/最新/只看我的；编辑器置顶。
export function AnnotationPanel({ postId, anchor, quote, initialDraft, currentUserId, onClose }: Props) {
  const [sort, setSort] = useState<Sort>('hot')
  const [mine, setMine] = useState(false)
  const [draft, setDraft] = useState<AnnotationDraft | null>(initialDraft)

  const params = new URLSearchParams({ anchor, sort })
  if (mine) params.set('mine', '1')
  const query = useQuery({
    queryKey: [...annotationsKey(postId), anchor, sort, mine ? 'mine' : 'all'],
    queryFn: () => api.get<AnnotationList>(`/posts/${postId}/annotations?${params.toString()}`),
  })

  const items = query.data?.items ?? []
  const count = query.data?.anchorCounts.find((c) => c.anchor === anchor)?.count ?? 0

  const startParagraphDraft = () => {
    const snapshot = quote
    setDraft({
      scope: 'paragraph',
      anchor,
      startOffset: 0,
      endOffset: 0,
      selectedText: snapshot,
      paragraphSnapshot: snapshot,
    })
  }

  return (
    <div
      className={cn(
        'fixed z-40 flex flex-col border-border bg-background shadow-xl',
        'max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[85vh] max-md:rounded-t-xl max-md:border-t',
        'md:right-0 md:top-0 md:h-full md:w-[380px] md:border-l',
      )}
    >
      <div className="flex items-start gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">段落想法 · {count || items.length || 0} 条</p>
          {quote && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{quote}</p>
          )}
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="关闭">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        {(['hot', 'latest'] as Sort[]).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={cn(
              'rounded-md px-2 py-1 text-xs transition-colors',
              sort === s && !mine ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {s === 'hot' ? '热门' : '最新'}
          </button>
        ))}
        <button
          onClick={() => setMine((v) => !v)}
          className={cn(
            'ml-auto rounded-md px-2 py-1 text-xs transition-colors',
            mine ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          只看我的
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {draft && (
          <AnnotationEditor postId={postId} draft={draft} onClose={() => setDraft(null)} />
        )}

        {!draft && (
          <button
            onClick={startParagraphDraft}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <MessageSquarePlus className="size-4" />
            对这一段写想法
          </button>
        )}

        {query.isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!query.isLoading && items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {mine ? '你还没有在这一段写下想法' : '这一段还没有想法，来写第一条吧'}
          </p>
        )}

        {items.map((a) => (
          <AnnotationItem key={a.id} postId={postId} annotation={a} currentUserId={currentUserId} />
        ))}
      </div>
    </div>
  )
}
