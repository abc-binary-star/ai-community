'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Flame, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'latest', label: '最新', icon: Timer },
  { key: 'hot', label: '最热', icon: Flame },
] as const

export function SortTabs({ current, basePath = '/community' }: { current: string; basePath?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sort)
    params.delete('page')
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card p-1 shadow-sm">
      {TABS.map((tab) => {
        const active = current === tab.key
        const Icon = tab.icon
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
