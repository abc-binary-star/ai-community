'use client'

import { useEffect, useState } from 'react'
import { PostCard, type PostCardVariant } from './post-card'
import type { Post } from 'shared'

/**
 * 发现页混合密度栅格（bento）。
 *
 * 论坛感最强的特征就是千篇一律的垂直卡片列。这里按内容与位置给每张卡分配不同
 * 形态，并用 2 列栅格 + 跨列打破单调：
 *   - 首帖（或置顶/精华且有封面）→ hero 主推位，横跨整行做视觉锚点；
 *   - 有封面 → standard 标准卡；
 *   - 无封面 → quote 引文卡，用大字引文顶上，避免"无图帖=一行灰字"的寡淡。
 * 每隔几张让一张无封面卡跨列，制造节奏，读起来像杂志而不是列表。
 */
export function DiscoverFeed({
  posts,
  onChanged,
  layout = 'stack',
}: {
  posts: Post[]
  onChanged?: () => void
  layout?: 'stack' | 'masonry'
}) {
  const [twoColumns, setTwoColumns] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const sync = () => setTwoColumns(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  if (posts.length === 0) return null

  const renderPost = (post: Post, index: number) => {
    const variant = pickVariant(post, index)
    return (
      <div
        key={post.id}
        className="animate-fade-in"
        style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: 'backwards' }}
      >
        <PostCard post={post} variant={variant} compact={layout === 'masonry'} onChanged={onChanged} />
      </div>
    )
  }

  if (layout === 'stack') {
    return <div className="grid gap-4">{posts.map(renderPost)}</div>
  }

  const columns = [posts.filter((_, index) => index % 2 === 0), posts.filter((_, index) => index % 2 === 1)]

  if (!twoColumns) {
    return <div className="grid gap-3">{posts.map(renderPost)}</div>
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="min-w-0 space-y-4">
          {column.map((post) => renderPost(post, posts.indexOf(post)))}
        </div>
      ))}
    </div>
  )
}

function pickVariant(post: Post, index: number): PostCardVariant {
  if (index === 0 && post.coverUrl) return 'hero'
  if (post.coverUrl) return 'standard'
  return 'quote'
}
