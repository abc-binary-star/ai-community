'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Loader2, LockKeyhole } from 'lucide-react'
import { fetchMe } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

/**
 * 活动页必须登录才能访问（P1-9 / 验收标准 9）：
 * 未登录用户直接引导注册登录，不展示棋盘与榜单。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const setUser = useAuthStore((s) => s.setUser)

  // 旧缓存（未重新登录）的 user 缺少 role 等字段，挂载时静默拉取最新资料，
  // 保证「形象」「终审台」等按角色显示的入口对管理员可见。
  useEffect(() => {
    if (!hasHydrated || !token) return
    let alive = true
    fetchMe()
      .then((u) => {
        if (alive) setUser(u)
      })
      .catch(() => {
        // token 失效等异常由请求层统一处理，这里不打断页面
      })
    return () => {
      alive = false
    }
  }, [hasHydrated, token, setUser])

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6ed]">
        <Loader2 className="size-6 animate-spin text-emerald-700" />
      </div>
    )
  }

  if (!token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6ed] px-6 [background-image:radial-gradient(#d6d3c5_0.8px,transparent_0.8px)] [background-size:18px_18px]">
        <div className="w-full max-w-sm rounded-lg border-2 border-stone-800 bg-[#fffdf5] p-8 shadow-[6px_6px_0_#292524] text-center">
          <LockKeyhole className="mx-auto mb-4 size-10 text-emerald-700" />
          <h1 className="text-lg font-black text-stone-900">无限循环读书地狱</h1>
          <p className="mt-2 text-sm font-medium text-stone-600">
            本活动仅对已登录成员开放，登录后可查看棋盘进度与榜单。
          </p>
          <Link
            href="/login?redirect=%2Factivity%2Fhell-board"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border-2 border-stone-800 bg-[#ffd166] text-sm font-black text-stone-900 shadow-[3px_3px_0_#292524] transition-colors hover:bg-[#f5c34f]"
          >
            登录 / 注册后参与
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
