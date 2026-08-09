'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Info, X } from 'lucide-react'
import { useAnnouncementBanner } from '@/lib/use-announcements'

const CLOSED_KEY = 'commons-closed-announcements'

export function AnnouncementBanner() {
  const bannerQuery = useAnnouncementBanner()
  const [closed, setClosed] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLOSED_KEY)
      setClosed(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      setClosed([])
    }
  }, [])

  const item = bannerQuery.data?.item ?? null
  if (!item) return null

  const urgent = item.level === 'urgent'
  if (!urgent && closed.includes(item.id)) return null

  const close = () => {
    const next = [...new Set([...closed, item.id])]
    setClosed(next)
    try {
      window.localStorage.setItem(CLOSED_KEY, JSON.stringify(next))
    } catch {
      // 隐私模式下写入失败静默忽略
    }
  }

  return (
    <div
      className={
        urgent
          ? 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-destructive/25 bg-destructive/15 px-3 py-2 text-sm sm:flex sm:px-4'
          : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-primary/25 bg-primary/10 px-3 py-2 text-sm sm:flex sm:px-4'
      }
    >
      {urgent ? (
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
      ) : (
        <Info className="size-4 shrink-0 text-primary" />
      )}
      <Link
        href={`/community/announcements/${item.id}`}
        className="min-w-0 flex-1 truncate font-medium hover:underline"
      >
        {item.title}
      </Link>
      <Link
        href={`/community/announcements/${item.id}`}
        className="col-start-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:col-auto sm:shrink-0 sm:text-xs"
      >
        查看详情
      </Link>
      {!urgent && (
        <button
          type="button"
          onClick={close}
          aria-label="关闭公告横幅"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
