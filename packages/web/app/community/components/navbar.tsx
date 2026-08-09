'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Bookmark, ChevronDown, FileText, LogOut, Megaphone, Menu, MessageCircle, PenLine, ScrollText, Settings, ShieldCheck, UserCog } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import { api } from '@/lib/api'
import type { PublicUser } from 'shared'
import { NotificationBell } from './notification-bell'
import { SearchBar } from './search-bar'
import { ThemeToggle } from './theme-toggle'

// 品牌标识：平面珊瑚方块 + 快乐体字标（去渐变去重投影，克制现代）
function BrandLogo() {
  return (
    <Link href="/community/discover" className="group flex min-w-0 items-center gap-2" aria-label="Commons 首页">
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/50 transition-colors duration-200 group-hover:border-primary sm:size-9 sm:rounded-xl">
        <span className="font-display text-lg leading-none text-primary sm:text-xl">C</span>
      </span>
      <span className="hidden truncate font-display text-xl font-bold leading-none tracking-tight text-foreground sm:inline">
        Commons
      </span>
    </Link>
  )
}

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

function NavbarInner({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const hydrated = useHydrated()

  // 拉取当前用户的统计数据（帖子数、粉丝数、关注数）
  const profileQuery = useQuery({
    queryKey: ['user', user?.username],
    queryFn: () => api.get<PublicUser>(`/users/${encodeURIComponent(user!.username)}`),
    enabled: !!user,
  })
  const stats = profileQuery.data

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 min-w-0 w-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2.5">
          {/* 移动端：汉堡菜单按钮 */}
          {onMenuClick && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 md:hidden"
              onClick={onMenuClick}
              aria-label="打开菜单"
            >
              <Menu className="size-5" />
            </Button>
          )}
          <BrandLogo />
        </div>

        {/* 搜索栏 */}
        <div className="hidden flex-1 justify-center sm:flex">
          <div className="w-full max-w-md">
            <SearchBar value={searchParams.get('q') || ''} />
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1.5">
          {!hydrated ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <>
              <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
                <Link href="/community/post/new">
                  <PenLine />
                  发帖
                </Link>
              </Button>
              <Button asChild size="icon" className="size-9 shrink-0 sm:hidden" aria-label="发帖">
                <Link href="/community/post/new">
                  <PenLine />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="收藏">
                <Link href="/bookmarks">
                  <Bookmark />
                </Link>
              </Button>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <div className="hidden sm:block">
                <MessageEntry />
              </div>
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-card p-1 transition-colors hover:border-primary/40 hover:bg-accent sm:size-auto sm:gap-2 sm:p-1 sm:pl-1.5 sm:pr-2"
                  >
                    <Avatar className="size-7">
                      {user.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(user.username)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-24 truncate text-sm font-medium sm:inline">{user.username}</span>
                    <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">已登录：{user.username}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* 统计按钮：动态 / 关注 / 粉丝，横向排列 */}
                  <div className="flex items-stretch gap-1 px-1 py-1">
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}`}
                      className="flex flex-1 flex-col items-center rounded-lg py-2 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold">{stats?.postCount ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">动态</span>
                    </Link>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}/following`}
                      className="flex flex-1 flex-col items-center rounded-lg py-2 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold">{stats?.followingCount ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">关注</span>
                    </Link>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}/followers`}
                      className="flex flex-1 flex-col items-center rounded-lg py-2 transition-colors hover:bg-accent"
                    >
                      <span className="text-base font-semibold">{stats?.followerCount ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">粉丝</span>
                    </Link>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/u/${encodeURIComponent(user.username)}`}>
                      <Avatar className="size-4">
                        {user.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
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
                  {user.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link href="/community/announcements/admin">
                        <Megaphone />
                        公告管理
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {user.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link href="/community/admin/users">
                        <UserCog />
                        用户管理
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
              <ThemeToggle />
              <Button asChild variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex">
                <Link href="/login">登录</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full">
                <Link href="/register">注册</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function Navbar({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <Suspense fallback={<header className="h-16 border-b border-border" />}>
      <NavbarInner onMenuClick={onMenuClick} />
    </Suspense>
  )
}
