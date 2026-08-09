'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { channelColor } from '@/lib/channel-colors'
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
  const color = channelColor(channel)

  const sizeClasses = size === 'sm'
    ? 'text-[11px] px-2.5 py-0.5'
    : 'text-xs px-3 py-1'

  const variantClasses = selected
    ? 'border-primary text-primary'
    : channel
      ? cn('text-muted-foreground hover:border-foreground/30 hover:text-foreground', color.border)
      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'

  const baseClasses = cn(
    'inline-flex items-center gap-1 rounded-full border font-medium transition-colors duration-150 cursor-pointer',
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
        {channel && <span className={cn('size-1.5 rounded-full', color.dot)} />}
        <span>{name}</span>
      </a>
    )
  }

  return (
    <button type="button" className={baseClasses} onClick={handleClick}>
      {channel && <span className={cn('size-1.5 rounded-full', color.dot)} />}
      <span>{name}</span>
    </button>
  )
}
