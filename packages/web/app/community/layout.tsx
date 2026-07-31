import type { ReactNode } from 'react'
import { Navbar } from './components/navbar'

// 社区布局：极细顶栏 + 居中阅读栏 + 安静的页脚
export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-2 py-6 text-xs text-muted-foreground md:flex-row">
          <p className="font-display tracking-tight">Commons · 一个写给读者的兴趣社区</p>
          <p className="font-sans uppercase tracking-[0.2em]">№ 001 · {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  )
}
