import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Plus_Jakarta_Sans, Noto_Serif_SC, ZCOOL_KuaiLe } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

// 免费可商用中文字体（SIL OFL / 免费商用授权），用于编辑器字体选项
const notoSerif = Noto_Serif_SC({
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-noto-serif',
  preload: false,
})

// 得意黑（Smiley Sans，SIL OFL 1.1）：不在 Google Fonts 上，自托管官方 woff2
const smiley = localFont({
  src: './fonts/SmileySans-Oblique.woff2',
  display: 'swap',
  variable: '--font-smiley',
  preload: false,
})

const zcool = ZCOOL_KuaiLe({
  weight: '400',
  display: 'swap',
  variable: '--font-zcool',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Commons · 兴趣社区',
  description: '一个清新的兴趣社区 — 在这里分享想法与创作',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${jakarta.variable} ${notoSerif.variable} ${smiley.variable} ${zcool.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
