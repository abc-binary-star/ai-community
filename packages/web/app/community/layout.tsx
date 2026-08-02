import type { ReactNode } from 'react'
import { Navbar } from './components/navbar'

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto w-full max-w-[1600px] py-6 px-4 text-center text-sm text-muted-foreground">
          Commons · 一个清新的兴趣社区
        </div>
      </footer>
    </div>
  )
}
