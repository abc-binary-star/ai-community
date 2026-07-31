'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  name: string
  selected?: boolean
  onClick?: () => void
  size?: 'sm' | 'md'
  asLink?: boolean
  channel?: string
}

export function TagBadge({ name, selected = false, onClick, size = 'sm', asLink = false, channel }: TagBadgeProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const sizeClasses = size === 'sm'
    ? 'text-[11px] px-2 py-0.5'
    : 'text-xs px-2.5 py-1'

  const variantClasses = selected
    ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary'
    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground border-transparent'

  const baseClasses = cn(
    'inline-flex items-center rounded-full border font-medium transition-colors cursor-pointer',
    sizeClasses,
    variantClasses,
  )

  const handleClick = () => {
    if (onClick) {
      onClick()
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set('tag', name)
    params.delete('page')
    router.push(`/community?${params.toString()}`)
  }

  if (asLink) {
    const href = channel
      ? `/community?channel=${encodeURIComponent(channel)}&tag=${encodeURIComponent(name)}`
      : `/community?tag=${encodeURIComponent(name)}`
    return (
      <a href={href} className={baseClasses} onClick={onClick}>
        #{name}
      </a>
    )
  }

  return (
    <button type="button" className={baseClasses} onClick={handleClick}>
      #{name}
    </button>
  )
}
