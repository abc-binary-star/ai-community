'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/lib/use-hydrated'
import { useTheme } from '@/lib/use-theme'

// 主题切换：亮/暗一键切换。水合前占位，避免图标闪烁。
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const hydrated = useHydrated()

  if (!hydrated) {
    return <div className="hidden size-10 sm:block" aria-hidden />
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
    >
      {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}
