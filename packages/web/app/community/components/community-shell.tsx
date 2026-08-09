'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Navbar } from './navbar'
import { Sidebar } from './sidebar'

// 社区主体布局：顶部导航 + 左侧侧边栏 + 主内容区
export function CommunityShell({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="relative flex h-screen flex-col bg-transparent">
      <Navbar onMenuClick={() => setSidebarOpen(true)} />
      {banner}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
            {children}
            <footer className="mt-16 flex flex-col items-center gap-1.5 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground">
              <p>
                <span className="font-display text-base font-semibold tracking-tight text-foreground/80">Commons</span>
                {' '}· 一个新鲜有趣的兴趣社区
              </p>
              <p className="text-xs text-muted-foreground/80">
                在这里分享想法、创作与灵感 —— 友善交流，尊重彼此
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
