'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Bookmark, ChevronDown, Compass, FileText, LogOut, MessageCircle, PenLine, ScrollText, Settings, ShieldCheck } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/lib/store'
import { useChannels } from '@/lib/use-channels'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import { api } from '@/lib/api'
import type { PublicUser } from 'shared'
import { CHANNELS, CHANNEL_LABELS } from 'shared'
import { NotificationBell } from './notification-bell'
import { SearchBar } from './search-bar'

// 私信入口：带未读角标，点击进入消息页
function MessageEntry() {
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()

  const unreadQuery = useQuery({
    queryKey: ['messages-unread-count'],
    queryFn: () => api.get<{ count: number }>('/messages/unread-count'),
    enabled: !!token,
    refetchInterval: 30000,
  })

  if (!hydrated || !token) return null
  const unread = unreadQuery.data?.count ?? 0

  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label="私信">
      <Link href="/messages">
        <MessageCircle className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}

function NavbarInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const hydrated = useHydrated()
  const activeChannel = searchParams.get('channel') || 'general'
  const { data: channels } = useChannels()

  // 拉取当前用户的统计数据（帖子数、粉丝数、关注数）
  const profileQuery = useQuery({
    queryKey: ['user', user?.username],
    queryFn: () => api.get<PublicUser>(`/users/${encodeURIComponent(user!.username)}`),
    enabled: !!user,
  })
  const stats = profileQuery.data

  // 频道列表，API 加载前使用 fallback
  const channelItems: { name: string; label: string }[] = (channels && channels.length > 0)
    ? channels
    : CHANNELS.map((name) => ({ name, label: CHANNEL_LABELS[name] || name }))

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          {/* 品牌：蓝色圆角方块 logo */}
          <Link href="/community/discover" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              C
            </span>
            <span className="text-base">Commons</span>
          </Link>
          {/* 频道 tab */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/community/discover"
              className={`mr-1 flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-foreground`}
            >
              <Compass className="size-4" />
              发现
            </Link>
            {channelItems.map((ch) => {
              const active = activeChannel === ch.name
              return (
                <Link
                  key={ch.name}
                  href={`/community?channel=${encodeURIComponent(ch.name)}`}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {ch.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* 搜索栏 */}
        <div className="flex-1 max-w-md">
          <SearchBar value={searchParams.get('q') || ''} />
        </div>

        <div className="flex items-center gap-2">
          {!hydrated ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/community/post/new">
                  <PenLine />
                  发帖
                </Link>
              </Button>
              <Button asChild size="icon" className="sm:hidden">
                <Link href="/community/post/new" aria-label="发帖">
                  <PenLine />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" aria-label="收藏">
                <Link href="/bookmarks">
                  <Bookmark />
                </Link>
              </Button>
              <MessageEntry />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-accent"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(user.username)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:inline">{user.username}</span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">已登录：{user.username}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* 统计按钮：动态 / 关注 / 粉丝，横向排列 */}
                  <div className="flex items-stretch gap-1 px-1 py-1">
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}`}
                      className="flex flex-1 flex-col items-center rounded-md py-2 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold">{stats?.postCount ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">动态</span>
                    </Link>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}/following`}
                      className="flex flex-1 flex-col items-center rounded-md py-2 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold">{stats?.followingCount ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">关注</span>
                    </Link>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}/followers`}
                      className="flex flex-1 flex-col items-center rounded-md py-2 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold">{stats?.followerCount ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">粉丝</span>
                    </Link>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/u/${encodeURIComponent(user.username)}`}>
                      <Avatar className="size-4">
                        <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(user.username)}</AvatarFallback>
                      </Avatar>
                      我的主页
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings />
                      设置
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/community/guidelines">
                      <ScrollText />
                      社区公约
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/community/drafts">
                      <FileText />
                      我的草稿
                    </Link>
                  </DropdownMenuItem>
                  {(user.role === 'admin' || user.role === 'moderator') && (
                    <DropdownMenuItem asChild>
                      <Link href="/community/moderation">
                        <ShieldCheck />
                        内容审核
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">登录</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">注册</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function Navbar() {
  return (
    <Suspense fallback={<header className="h-16 border-b border-border" />}>
      <NavbarInner />
    </Suspense>
  )
}
