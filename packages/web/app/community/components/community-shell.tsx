'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Navbar } from './navbar'
import { Sidebar } from './sidebar'

// 社区主体布局：顶部导航 + 左侧侧边栏 + 主内容区
export function CommunityShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-background">
      <Navbar onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
            {children}
            <footer className="mt-12 border-t border-border py-6 text-center text-sm text-muted-foreground">
              Commons · 一个清新的兴趣社区
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
