'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Flame, Timer, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'latest', label: '最新', icon: Timer },
  { key: 'hot', label: '最热', icon: Flame },
  { key: 'following', label: '关注', icon: Users },
] as const

export function SortTabs({ current, basePath = '/community' }: { current: string; basePath?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (sort === 'following') {
      params.set('feed', 'following')
      params.delete('sort')
      params.delete('channel')
      params.delete('page')
    } else {
      params.delete('feed')
      params.set('sort', sort)
      params.delete('page')
    }
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <div className="inline-flex items-center gap-5 border-b border-border">
      {TABS.map((tab) => {
        const active =
          tab.key === 'following'
            ? current === 'following'
            : current === tab.key && !searchParams.get('feed')
        const Icon = tab.icon
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleChange(tab.key)}
            className={cn(
              'relative flex items-center gap-1.5 pb-2 text-sm font-medium transition-colors duration-150',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
            {/* 选中态：底部主色细线，替代实色胶囊块 */}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden />
            )}
          </button>
        )
      })}
    </div>
  )
}
