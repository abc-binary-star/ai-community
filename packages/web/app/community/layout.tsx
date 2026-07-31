import type { ReactNode } from 'react'
import { Navbar } from './components/navbar'

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-8">{children}</main>
      <footer className="border-t border-border bg-card/50">
        <div className="container py-6 text-center text-sm text-muted-foreground">
          Commons · 一个清新的兴趣社区
        </div>
      </footer>
    </div>
  )
}
