'use client'

import { useEffect, useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

// 通用点赞按钮：可复用在帖子卡片/详情/评论上
// target: 'post' | 'comment'，对应不同的 API 路径 (/posts/:id/like | /comments/:id/like)
type Target = 'post' | 'comment'

interface Props {
  target: Target
  id: string
  likeCount: number
  liked: boolean
  size?: 'sm' | 'md'
  // 点赞状态变化时回调，让父组件同步自己的缓存（如 react-query）
  onChanged?: (next: { liked: boolean; likeCount: number }) => void
}

export function LikeButton({ target, id, likeCount, liked, size = 'sm', onChanged }: Props) {
  const token = useAuthStore((s) => s.token)
  const [state, setState] = useState({ liked, likeCount })
  const [submitting, setSubmitting] = useState(false)

  // 外部数据刷新（如评论列表 invalidate 后）时同步内部 state
  useEffect(() => {
    setState({ liked, likeCount })
  }, [liked, likeCount])

  const handleClick = async () => {
    if (!token) {
      toast.info('登录后即可点赞')
      return
    }
    if (submitting) return
    setSubmitting(true)
    const path = `/${target}s/${id}/like`
    // 乐观更新：先切换 UI，失败再回滚
    const prev = state
    const next = { liked: !state.liked, likeCount: state.liked ? state.likeCount - 1 : state.likeCount + 1 }
    setState(next)
    try {
      const res = prev.liked
        ? await api.del<{ liked: boolean; likeCount: number }>(path)
        : await api.post<{ liked: boolean; likeCount: number }>(path)
      setState({ liked: res.liked, likeCount: res.likeCount })
      onChanged?.({ liked: res.liked, likeCount: res.likeCount })
    } catch (e) {
      setState(prev) // 回滚
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
      aria-pressed={state.liked}
      aria-label={state.liked ? '取消点赞' : '点赞'}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg font-medium transition-colors',
        padX,
        textSize,
        state.liked
          ? 'text-rose-500 hover:bg-rose-50'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        submitting && 'opacity-60',
      )}
    >
      {submitting ? (
        <Loader2 className={cn(iconSize, 'animate-spin')} />
      ) : (
        <Heart className={cn(iconSize, state.liked && 'fill-current')} />
      )}
      <span>{state.likeCount}</span>
    </button>
  )
}
