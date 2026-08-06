'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCheck, ChevronLeft, ChevronRight, Megaphone, Pin, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
  ANNOUNCEMENT_LEVEL_LABELS,
} from '@/lib/announcements-meta'
import { useAnnouncements, useMarkAllAnnouncementsRead } from '@/lib/use-announcements'

export default function AnnouncementsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const category = searchParams.get('category') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') || 1))

  const query = useAnnouncements(category, page)
  const markAll = useMarkAllAnnouncementsRead()
  const loggedIn = hydrated && !!token

  const changeCategory = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('category', next)
    else params.delete('category')
    params.delete('page')
    router.replace(`/community/announcements?${params.toString()}`)
  }

  const changePage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next > 1) params.set('page', String(next))
    else params.delete('page')
    router.replace(`/community/announcements?${params.toString()}`)
  }

  const handleMarkAll = async () => {
    try {
      await markAll.mutateAsync()
      toast.success('已全部标为已读')
    } catch {
      toast.error('操作失败，请稍后重试')
    }
  }

  const items = query.data?.items ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Megaphone className="size-5 text-primary" />
          公告中心
        </h1>
        {loggedIn && (
          <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={markAll.isPending}>
            {markAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck />}
            全部标为已读
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeCategory('')}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm transition-colors',
            !category ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          全部
        </button>
        {ANNOUNCEMENT_CATEGORIES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => changeCategory(key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              category === key ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {ANNOUNCEMENT_CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载公告…
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <div className="p-12 text-center text-sm text-muted-foreground">暂无公告</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/community/announcements/${item.id}`}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/40"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {loggedIn && !item.isRead && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" />
                )}
                {item.isPinned && <Pin className="mt-0.5 size-4 shrink-0 text-primary" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{ANNOUNCEMENT_CATEGORY_LABELS[item.category]}</Badge>
                    {item.level !== 'normal' && (
                      <span className="text-xs text-muted-foreground">
                        {ANNOUNCEMENT_LEVEL_LABELS[item.level]}
                      </span>
                    )}
                    <span className="truncate font-medium group-hover:text-primary">{item.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(item.publishAt)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {query.data && query.data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
          >
            <ChevronLeft />
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {query.data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= query.data.totalPages}
            onClick={() => changePage(page + 1)}
          >
            下一页
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
