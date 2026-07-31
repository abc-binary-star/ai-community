'use client'

import { useEffect, useState } from 'react'
import { Bookmark, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface Props {
  id: string
  bookmarked: boolean
  size?: 'sm' | 'md'
  onChanged?: (next: { bookmarked: boolean }) => void
  className?: string
}

export function BookmarkButton({ id, bookmarked, size = 'sm', onChanged, className }: Props) {
  const token = useAuthStore((s) => s.token)
  const [state, setState] = useState(bookmarked)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setState(bookmarked)
  }, [bookmarked])

  const handleClick = async () => {
    if (!token) {
      toast.info('登录后即可收藏')
      return
    }
    if (submitting) return
    setSubmitting(true)
    const prev = state
    const next = !state
    setState(next)
    try {
      if (next) {
        await api.post(`/posts/${id}/bookmark`)
      } else {
        await api.del(`/posts/${id}/bookmark`)
      }
      onChanged?.({ bookmarked: next })
    } catch (e) {
      setState(prev)
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'
  const padX = size === 'sm' ? 'px-2 h-7' : 'px-3 h-9'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      aria-pressed={state}
      aria-label={state ? '取消收藏' : '收藏'}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg font-medium transition-colors',
        padX,
        textSize,
        state
          ? 'text-amber-500 hover:bg-amber-50'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        submitting && 'opacity-60',
        className,
      )}
    >
      {submitting ? (
        <Loader2 className={cn(iconSize, 'animate-spin')} />
      ) : (
        <Bookmark className={cn(iconSize, state && 'fill-current')} />
      )}
    </button>
  )
}
