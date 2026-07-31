import type { ReactNode } from 'react'
import Link from 'next/link'

// 登录/注册：编辑性分屏 —— 左栏刊首语，右栏表单
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-12">
      {/* 左栏：刊首语（移动端隐藏） */}
      <aside className="relative hidden flex-col justify-between border-r border-border bg-surface p-12 md:col-span-7 md:flex">
        <Link href="/community" className="font-display text-2xl tracking-tight">
          Commons
        </Link>
        <div className="max-w-md space-y-6">
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-muted-foreground">§ 创刊语</p>
          <p className="font-serif text-3xl leading-relaxed text-foreground">
            不必喧嚣，
            <br />
            在这里找到你的<span className="italic text-primary">同好</span>。
          </p>
          <p className="font-serif text-base leading-7 text-muted-foreground">
            一个写给读者的兴趣社区。慢一点，深一点 ——
            像翻一本会回信的杂志。
          </p>
        </div>
        <p className="font-sans text-xs text-muted-foreground">№ 001 · {new Date().getFullYear()}</p>
      </aside>

      {/* 右栏：表单 */}
      <main className="flex items-center justify-center px-6 py-12 md:col-span-5">
        <div className="w-full max-w-sm animate-fade-in">{children}</div>
      </main>
    </div>
  )
}
