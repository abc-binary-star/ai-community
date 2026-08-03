import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'

// 登录/注册：清爽居中布局 + 顶部品牌
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-accent/50 via-background to-background px-4 py-10">
      <Link href="/community/discover" className="mb-8 flex items-center gap-2 font-semibold">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          C
        </span>
        <span className="text-lg">Commons</span>
      </Link>
      <Suspense>{children}</Suspense>
    </div>
  )
}
