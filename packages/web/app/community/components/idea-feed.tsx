'use client'

import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIdeaFeedQuery, type IdeaFeedSort } from '@/lib/use-idea-feed'
import { IdeaCard } from './idea-card'

const SORTS: { key: IdeaFeedSort; label: string }[] = [
  { key: 'hot', label: '被讨论最多' },
  { key: 'latest', label: '最新' },
]

/**
 * 想法流：以想法为最小单元的跨帖信息流。
 *
 * 排序上「被讨论最多」优先于点赞：早期样本稀疏时点赞不具备区分能力，
 * 一条引发了后续回应的想法比一条获得若干赞的想法更值得推荐。
 */
export function IdeaFeed({
  sort,
  onSortChange,
}: {
  sort: IdeaFeedSort
  onSortChange: (s: IdeaFeedSort) => void
}) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useIdeaFeedQuery(sort)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 触底自动加载：想法流是用来发现和闲逛的，翻页器会打断这个节奏
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const cards = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSortChange(s.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              sort === s.key
                ? 'border-primary/60 font-medium text-primary'
                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" />
          加载中…
        </div>
      ) : isError ? (
        <div className="py-20 text-center text-muted-foreground">
          加载失败：{(error as Error).message}
        </div>
      ) : cards.length > 0 ? (
        <>
          <div className="grid gap-4">
            {cards.map((c) => (
              <IdeaCard key={`${c.type}-${c.id}`} card={c} />
            ))}
          </div>

          <div ref={sentinelRef} aria-hidden />

          {isFetchingNextPage && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载更多…
            </div>
          )}
          {!hasNextPage && (
            <p className="py-6 text-center text-sm text-muted-foreground">没有更多了</p>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card/50 py-20 text-center">
          <p className="text-muted-foreground">还没有可展示的想法</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            在帖子正文里选中一段写下你的判断，它就会出现在这里
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <a href="/community?view=posts">去看帖子</a>
          </Button>
        </div>
      )}
    </div>
  )
}
