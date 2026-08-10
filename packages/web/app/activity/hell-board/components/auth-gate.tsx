'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { fetchMe } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

/**
 * 活动相关页面必须登录才能访问（P1-9 / 验收标准 9）：
 * 未登录用户直接跳转登录页（登录成功后回跳当前页），不展示棋盘与榜单。
 * 棋盘页与人工终审台共用，回跳目标按所在路径自动生成。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const setUser = useAuthStore((s) => s.setUser)

  useEffect(() => {
    if (!hasHydrated) return

    // 未登录：直接跳转登录页，登录成功后回跳当前页
    if (!token || !user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }

    // 已登录：静默拉取最新资料，保证「形象」「终审台」等按角色显示的入口正确。
    let alive = true
    fetchMe()
      .then((u) => {
        if (alive) setUser(u)
      })
      .catch(() => {
        // token 失效等异常由请求层统一跳转登录页，这里不打断页面
      })
    return () => {
      alive = false
    }
  }, [hasHydrated, token, user, router, setUser, pathname])

  // persist 尚未从 localStorage 恢复时先显示加载态，避免误跳转
  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6ed]">
        <Loader2 className="size-6 animate-spin text-emerald-700" />
      </div>
    )
  }

  return <>{children}</>
}
