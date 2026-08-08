import { Suspense } from 'react'
import Link from 'next/link'

// 登录/注册：暖纸底色 + 彩色光斑 + 顶部品牌
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* 彩色氛围光斑 */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-96 rounded-full bg-amber-300/25 blur-3xl" />
        <div className="absolute right-1/4 top-1/3 size-64 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="absolute left-1/3 bottom-1/4 size-64 rounded-full bg-rose-300/15 blur-3xl" />
      </div>

      <Link
        href="/community/discover"
        className="group relative mb-8 flex items-center gap-2.5"
      >
        <span className="relative flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-primary to-rose-500 shadow-[0_4px_14px_rgba(230,90,40,0.35)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
          <span className="font-display text-2xl leading-none text-white drop-shadow-sm">C</span>
          <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-background bg-emerald-400" />
        </span>
        <span className="font-display text-2xl leading-none tracking-wide text-foreground">Commons</span>
      </Link>
      <Suspense>{children}</Suspense>
    </div>
  )
}
