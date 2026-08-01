'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Navbar } from '@/app/community/components/navbar'
import { cn, formatRelativeTime } from '@/lib/utils'
import { TYPE_ICON, TYPE_LABEL } from '@/lib/notification-meta'
import { toast } from 'sonner'
import type { Notification, Paginated } from 'shared'

function NotificationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => api.get<Paginated<Notification>>(`/notifications?page=${page}&pageSize=20`),
    enabled: !!token,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      queryClient.setQueryData(['notifications-unread-count'], { count: 0 })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('已全部标为已读')
    },
    onError: (e: ApiError) => toast.error(e.message || '操作失败'),
  })

  const markOneReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  if (!token || !user) {
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
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
                'cursor-pointer transition-colors hover:bg-accent/50',
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
                      {TYPE_LABEL[n.type]}
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
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <div className="container flex-1 py-8">
        <Suspense>
          <NotificationsContent />
        </Suspense>
      </div>
    </div>
  )
}
