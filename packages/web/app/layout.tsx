import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Plus_Jakarta_Sans, Noto_Serif_SC, ZCOOL_KuaiLe, Sora } from 'next/font/google'
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

// Sora：几何科技无衬线，用作品牌与标题展示字体（AI 产品气质）
const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'Commons · 兴趣社区',
  description: '一个新鲜有趣的兴趣社区 — 在这里分享想法、创作与灵感',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${jakarta.variable} ${sora.variable} ${notoSerif.variable} ${smiley.variable} ${zcool.variable}`}
    >
      <head>
        {/* 主题防闪烁：水合前根据 localStorage / 系统偏好同步 .dark 类 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('commons-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
