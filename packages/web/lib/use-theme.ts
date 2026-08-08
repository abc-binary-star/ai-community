'use client'

import { useCallback, useEffect, useState } from 'react'

// 亮/暗主题：无第三方依赖，localStorage 持久化 + <html>.dark 类切换。
// 防闪烁由 layout.tsx 注入的内联脚本在水合前完成，这里只负责读写与响应。
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'commons-theme'

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setThemeState(stored ?? (prefersDark ? 'dark' : 'light'))
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    localStorage.setItem(STORAGE_KEY, next)
    apply(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggle }
}
