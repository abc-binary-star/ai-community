'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Flame, Loader2, MessageSquarePlus, User, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { annotationsKey } from '@/lib/use-annotations'
import { WHOLE_ANNOTATION_ANCHOR, type AnnotationList } from 'shared'
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
  const isWhole = anchor === WHOLE_ANNOTATION_ANCHOR

  const startParagraphDraft = () => {
    if (isWhole) {
      setDraft({
        scope: 'whole',
        anchor: WHOLE_ANNOTATION_ANCHOR,
        startOffset: 0,
        endOffset: 0,
        selectedText: '',
      })
      return
    }
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
        'fixed z-50 flex flex-col border-border bg-background shadow-xl',
        'max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[85dvh] max-md:rounded-t-xl max-md:border-t max-md:pb-[env(safe-area-inset-bottom)]',
        'md:right-0 md:top-0 md:h-full md:w-[380px] md:border-l',
      )}
    >
      <div className="flex items-start gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {isWhole ? '整篇想法' : '页边想法'}
            <span className="text-primary">· {count || items.length || 0}</span>
          </p>
          {isWhole ? (
            <p className="mt-2 text-sm text-muted-foreground">对整篇文章的想法都汇聚在这里</p>
          ) : (
            quote && (
              <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 font-serifcn text-sm italic leading-relaxed text-foreground/75 line-clamp-3">
                {quote}
              </blockquote>
            )
          )}
        </div>
        <button onClick={onClose} className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:size-8" aria-label="关闭">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        {(['hot', 'latest'] as Sort[]).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              sort === s && !mine ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s === 'hot' ? <Flame className="size-3.5" /> : <Clock className="size-3.5" />}
            {s === 'hot' ? '热门' : '最新'}
          </button>
        ))}
        <button
          onClick={() => setMine((v) => !v)}
          className={cn(
            'ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
            mine ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <User className="size-3.5" />
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
            {isWhole ? '对整篇文章写想法' : '对这一段写想法'}
          </button>
        )}

        {query.isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!query.isLoading && items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {isWhole
              ? mine
                ? '你还没有对整篇写下想法'
                : '还没有对整篇的想法，来写第一条吧'
              : mine
                ? '你还没有在这一段写下想法'
                : '这一段还没有想法，来写第一条吧'}
          </p>
        )}

        {items.map((a) => (
          <AnnotationItem key={a.id} postId={postId} annotation={a} currentUserId={currentUserId} />
        ))}
      </div>
    </div>
  )
}
