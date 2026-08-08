'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronDown, Loader2, MessageSquarePlus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { formatRelativeTime, getInitials } from '@/lib/utils'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { annotationsKey } from '@/lib/use-annotations'
import { WHOLE_ANNOTATION_ANCHOR, type AnnotationList, type Comment, type Paginated } from 'shared'
import { AnnotationItem } from './annotation-item'
import { AnnotationEditor, type AnnotationDraft } from './annotation-editor'

const HISTORY_PAGE_SIZE = 10

interface Props {
  postId: string
}

// 整篇讨论：本次改版把「帖子底部评论」降级为想法面板的「整篇」分组。
// 对整篇文章的评论在数据上是锚定到整篇的想法，三个讨论场域收敛为一个模型的
// 三种锚定粒度。旧评论数据保留展示，标注为历史评论，不再提供新建入口。
export function WholeDiscussion({ postId }: Props) {
  const token = useAuthStore((s) => s.token)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const hydrated = useHydrated()
  const isLoggedIn = hydrated && !!token
  const [draft, setDraft] = useState<AnnotationDraft | null>(null)

  // 整篇想法列表（锚点固定为 __whole__）
  const ideasQuery = useQuery({
    queryKey: [...annotationsKey(postId), WHOLE_ANNOTATION_ANCHOR, 'hot', 'all'],
    queryFn: () =>
      api.get<AnnotationList>(
        `/posts/${postId}/annotations?anchor=${encodeURIComponent(WHOLE_ANNOTATION_ANCHOR)}&sort=hot`,
      ),
  })
  const ideas = ideasQuery.data?.items ?? []
  const ideaCount =
    ideasQuery.data?.anchorCounts.find((c) => c.anchor === WHOLE_ANNOTATION_ANCHOR)?.count ?? ideas.length

  // 历史评论：旧评论区数据只读展示，不再提供新建/回复入口
  const historyQuery = useInfiniteQuery({
    queryKey: ['comments', postId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Comment>>(`/posts/${postId}/comments?page=${pageParam}&pageSize=${HISTORY_PAGE_SIZE}`),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  })

  const loadedHistory = historyQuery.data?.pages.flatMap((p) => p.items) ?? []
  const hasMoreHistory = historyQuery.hasNextPage

  const startWholeDraft = () => {
    setDraft({
      scope: 'whole',
      anchor: WHOLE_ANNOTATION_ANCHOR,
      startOffset: 0,
      endOffset: 0,
      selectedText: '',
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">讨论 {ideaCount > 0 ? `· ${ideaCount}` : ''}</h2>

      {isLoggedIn ? (
        draft ? (
          <AnnotationEditor postId={postId} draft={draft} onClose={() => setDraft(null)} />
        ) : (
          <button
            onClick={startWholeDraft}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <MessageSquarePlus className="size-4" />
            对整篇文章写想法
          </button>
        )
      ) : (
        <Card className="border-dashed">
          <div className="p-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              登录
            </Link>
            后即可参与讨论与点赞
          </div>
        </Card>
      )}

      {ideasQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : ideas.length > 0 ? (
        <div className="space-y-3">
          {ideas.map((a) => (
            <AnnotationItem key={a.id} postId={postId} annotation={a} currentUserId={currentUserId} />
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">还没有对整篇的想法，来写第一条吧</p>
      )}

      <HistorySection
        loading={historyQuery.isLoading}
        comments={loadedHistory}
        hasMore={!!hasMoreHistory}
        onMore={() => historyQuery.fetchNextPage()}
        loadingMore={historyQuery.isFetchingNextPage}
      />
    </div>
  )
}

// HistorySection 历史评论只读区：旧数据保留展示，标注为历史评论。
function HistorySection({
  loading,
  comments,
  hasMore,
  onMore,
  loadingMore,
}: {
  loading: boolean
  comments: Comment[]
  hasMore: boolean
  onMore: () => void
  loadingMore: boolean
}) {
  if (loading || comments.length === 0) return null
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-medium text-muted-foreground">历史评论（只读）</p>
      {comments.map((c) => (
        <HistoryComment key={c.id} comment={c} />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={onMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
            加载更多历史评论
          </Button>
        </div>
      )}
    </div>
  )
}

function HistoryComment({ comment }: { comment: Comment }) {
  return (
    <Card className="border-l-2 border-l-border bg-muted/30">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            {comment.author.avatar && <AvatarImage src={comment.author.avatar} alt={comment.author.username} />}
            <AvatarFallback className="bg-muted text-[10px]">
              {getInitials(comment.author.username)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{comment.author.username}</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
        </div>
        <div className="mt-2 break-words text-sm leading-6 text-foreground/80">
          <MarkdownRenderer content={comment.content} />
        </div>
        {comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 border-l border-border pl-3">
            {comment.replies.map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{r.author.username}</span>
                  <span className="text-[11px] text-muted-foreground">{formatRelativeTime(r.createdAt)}</span>
                </div>
                <div className="mt-1 break-words text-sm leading-6 text-foreground/70">
                  <MarkdownRenderer content={r.content} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
