'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { CommunityShell } from '@/app/community/components/community-shell'
import { cn, formatRelativeTime } from '@/lib/utils'
import { TYPE_ICON, notificationLabel } from '@/lib/notification-meta'
import { toast } from 'sonner'
import type { Notification, Paginated } from 'shared'

function NotificationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const filterType = searchParams.get('type') || 'all'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', page, filterType],
    queryFn: () =>
      api.get<Paginated<Notification>>(
        filterType === 'all'
          ? `/notifications?page=${page}&pageSize=20`
          : `/notifications?page=${page}&pageSize=20&type=${filterType}`,
      ),
    enabled: !!token,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      queryClient.setQueryData(['notifications-unread-count'], { count: 0 })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('已全部标为已读')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  const markOneReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : '标记已读失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      toast.success('通知已删除')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : '删除失败'),
  })

  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除此通知？')) return
    deleteMutation.mutate(id)
  }

  if (!hasHydrated || !token || !user) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Bell className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="text-muted-foreground">请先登录查看通知</p>
        <Button asChild className="mt-4">
          <Link href="/login">去登录</Link>
        </Button>
      </div>
    )
  }

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) {
      markOneReadMutation.mutate(n.id)
    }
    if (n.postId) {
      router.push(`/community/post/${n.postId}`)
    } else if (n.actorName) {
      router.push(`/u/${encodeURIComponent(n.actorName)}`)
    }
  }

  const goPage = (n: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(n))
    router.push(`/notifications?${params.toString()}`)
  }

  const setFilterType = (type: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (type === 'all') {
      params.delete('type')
    } else {
      params.set('type', type)
    }
    params.set('page', '1')
    router.push(`/notifications?${params.toString()}`)
  }

  const FILTER_TABS: { label: string; value: string }[] = [
    { label: '全部', value: 'all' },
    { label: '评论', value: 'comment' },
    { label: '回复', value: 'reply' },
    { label: '点赞', value: 'like' },
    { label: '关注', value: 'follow' },
    { label: '@提及', value: 'mention' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold">通知</h1>
        </div>
        {data && data.items.some((n) => !n.read) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            {markAllReadMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCheck />
            )}
            全部标为已读
          </Button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilterType(tab.value)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              filterType === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" />
          加载中…
        </div>
      ) : isError ? (
        <Card className="border-dashed">
          <div className="p-10 text-center text-muted-foreground">加载失败，请重试</div>
        </Card>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-2">
          {data.items.map((n) => (
            <Card
              key={n.id}
              className={cn(
                'group relative cursor-pointer transition-colors hover:bg-accent/50',
                !n.read && 'border-primary/40 bg-primary/[0.02]',
              )}
              onClick={() => handleNotificationClick(n)}
            >
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  {TYPE_ICON[n.type]}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm', !n.read && 'font-semibold')}>
                      <span className="text-primary">{n.actorName || '匿名'}</span>{' '}
                      {notificationLabel(n)}
                    </span>
                    {!n.read && (
                      <span className="size-2 rounded-full bg-destructive" />
                    )}
                  </div>
                  {n.content && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{n.content}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(n.id)
                }}
                disabled={deleteMutation.isPending}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="删除通知"
              >
                {deleteMutation.isPending && deleteMutation.variables === n.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <X className="size-3.5" />
                )}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <div className="p-12 text-center">
            <Bell className="mx-auto mb-4 size-10 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">暂无通知</p>
          </div>
        </Card>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
            <ChevronLeft />
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {data.totalPages} 页
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => goPage(page + 1)}>
            下一页
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}

export default function NotificationsPage() {
  return (
    <CommunityShell>
      <Suspense>
        <NotificationsContent />
      </Suspense>
    </CommunityShell>
  )
}
