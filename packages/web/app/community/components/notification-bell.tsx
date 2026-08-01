'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatRelativeTime } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { TYPE_ICON, TYPE_LABEL } from '@/lib/notification-meta'
import { toast } from 'sonner'
import type { Notification, Paginated } from 'shared'

export function NotificationBell() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const [isOpen, setIsOpen] = useState(false)

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: !!token,
    refetchInterval: 30000,
  })

  const notificationsQuery = useQuery({
    queryKey: ['notifications-latest'],
    queryFn: () => api.get<Paginated<Notification>>('/notifications?page=1&pageSize=5'),
    enabled: !!token && isOpen,
  })

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all')
      queryClient.setQueryData(['notifications-unread-count'], { count: 0 })
      queryClient.invalidateQueries({ queryKey: ['notifications-latest'] })
      toast.success('已全部标为已读')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  const unreadCount = unreadQuery.data?.count ?? 0
  const latest = notificationsQuery.data?.items ?? []

  if (!hydrated || !token) return null

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="通知">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>通知</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-normal text-muted-foreground hover:text-foreground"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <CheckCheck />
            全部已读
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notificationsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </div>
        ) : latest.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            <BellOff className="size-6 opacity-50" />
            <p>暂无通知</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {latest.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => {
                  if (n.postId) {
                    router.push(`/community/post/${n.postId}`)
                  } else if (n.actorName) {
                    router.push(`/u/${encodeURIComponent(n.actorName)}`)
                  } else {
                    router.push('/notifications')
                  }
                }}
                className="flex cursor-pointer flex-col items-start gap-1 rounded-none px-3 py-2.5 text-sm"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                    {TYPE_ICON[n.type]}
                  </span>
                  <span className={cn('flex-1 truncate', !n.read && 'font-medium')}>
                    {n.actorName || '匿名'} {TYPE_LABEL[n.type]}
                  </span>
                  {!n.read && <span className="size-2 shrink-0 rounded-full bg-destructive" />}
                </div>
                {n.content && (
                  <p className="line-clamp-1 pl-8 text-xs text-muted-foreground">{n.content}</p>
                )}
                <span className="pl-8 text-[11px] text-muted-foreground">
                  {formatRelativeTime(n.createdAt)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center">
          <Link href="/notifications" className="w-full text-center text-xs text-muted-foreground">
            查看全部通知
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
