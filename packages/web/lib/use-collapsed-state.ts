'use client'

import { useState, useEffect, useCallback } from 'react'

// 侧边栏分组折叠状态，持久化到 localStorage
export function useCollapsedState(key: string) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`sidebar-collapsed-${key}`)
      if (saved !== null) setCollapsed(saved === 'true')
    } catch {
      // localStorage 不可用时忽略
    }
  }, [key])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`sidebar-collapsed-${key}`, String(next))
      } catch {
        // 忽略写入失败
      }
      return next
    })
  }, [key])

  return { collapsed, toggle }
}
