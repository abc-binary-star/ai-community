'use client'

import { cn } from '@/lib/utils'
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
}: {
  posts: Post[]
  onChanged?: () => void
}) {
  if (posts.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {posts.map((post, i) => {
        const variant = pickVariant(post, i)
        // hero 与每第 7 张无封面引文卡跨整行，形成呼吸节奏
        const span = variant === 'hero' || (variant === 'quote' && i % 7 === 3)
        return (
          <div
            key={post.id}
            className={cn('animate-fade-in', span && 'md:col-span-2')}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: 'backwards' }}
          >
            <PostCard post={post} variant={variant} onChanged={onChanged} />
          </div>
        )
      })}
    </div>
  )
}

// 按位置与内容决定卡片形态
function pickVariant(post: Post, index: number): PostCardVariant {
  if (index === 0 && post.coverUrl) return 'hero'
  if (post.coverUrl) return 'standard'
  return 'quote'
}
