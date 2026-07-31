'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, LogOut, PenLine } from 'lucide-react'
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
import { getInitials } from '@/lib/utils'
import { CHANNELS, CHANNEL_LABELS } from 'shared'

function NavbarInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const activeChannel = searchParams.get('channel') || 'general'

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          {/* 刊名：§ 符号 + 衬线 Commons，替代紫色方块 logo */}
          <Link href="/community" className="flex items-baseline gap-1.5">
            <span className="font-display text-xl text-primary">§</span>
            <span className="font-display text-xl tracking-tight">Commons</span>
          </Link>
          {/* 频道：文字 tab，下划线高亮 */}
          <nav className="hidden items-center gap-5 md:flex">
            {CHANNELS.map((ch) => {
              const active = activeChannel === ch
              return (
                <Link
                  key={ch}
                  href={`/community?channel=${encodeURIComponent(ch)}`}
                  className={`relative font-sans text-sm transition-colors ${
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {CHANNEL_LABELS[ch] || ch}
                  <span
                    className={`absolute -bottom-[22px] left-0 h-px bg-primary transition-all ${
                      active ? 'w-full' : 'w-0'
                    }`}
                  />
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Button asChild variant="link" size="sm" className="hidden sm:inline-flex">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-2 py-1 transition-colors hover:opacity-70">
                    <Avatar className="size-8 rounded-full">
                      <AvatarFallback className="rounded-full font-sans text-xs">{getInitials(user.username)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden font-sans text-sm sm:inline">{user.username}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="truncate font-serif italic">已登录：{user.username}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="font-sans">
                    <LogOut />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="link" size="sm">
                <Link href="/login">登录</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/register">注册</Link>
              </Button>
            </div>
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
