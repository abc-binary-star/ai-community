'use client'

import { useState } from 'react'
import { Share2, Check, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  postId: string
  title?: string
  size?: 'sm' | 'md'
  className?: string
}

export function ShareButton({ postId, title, size = 'sm', className }: Props) {
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/community/post/${postId}`
    : `/community/post/${postId}`

  const handleShare = async () => {
    // 优先使用 Web Share API（移动端原生分享）
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: title || 'Commons 社区帖子',
          url: shareUrl,
        })
        return
      } catch {
        // 用户取消分享，不做处理
        return
      }
    }

    // 降级：复制链接到剪贴板
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('链接已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败，请手动复制链接')
    }
  }

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'
  const padX = size === 'sm' ? 'px-2 h-7' : 'px-3 h-9'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="分享"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg font-medium transition-colors',
        padX,
        textSize,
        'text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {copied ? (
        <Check className={cn(iconSize, 'text-green-500')} />
      ) : (
        <Share2 className={iconSize} />
      )}
    </button>
  )
}
