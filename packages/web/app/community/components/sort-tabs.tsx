'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '最热' },
] as const

export function SortTabs({ current }: { current: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sort)
    params.delete('page')
    router.push(`/community?${params.toString()}`)
  }

  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-0.5">
      {TABS.map((tab) => {
        const active = current === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleChange(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
