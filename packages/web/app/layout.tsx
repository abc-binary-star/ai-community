import type { Metadata } from 'next'
import { Fraunces, Newsreader, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

// 标题/品牌：Fraunces 衬线，启用 SOFT 轴让它更温润
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['SOFT', 'opsz'],
})

// 正文：Newsreader，专为屏幕阅读设计的衬线
const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
  style: ['normal', 'italic'],
})

// UI 元素：IBM Plex Sans
const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Commons · 兴趣社区',
  description: '一个写给读者的兴趣社区 — 在这里分享想法与创作',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${fraunces.variable} ${newsreader.variable} ${plex.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
