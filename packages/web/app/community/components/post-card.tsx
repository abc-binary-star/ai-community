'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, MessageCircle } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatRelativeTime, getInitials, truncate } from '@/lib/utils'
import { CHANNEL_LABELS, type Post } from 'shared'
import { LikeButton } from './like-button'
import { BookmarkButton } from './bookmark-button'
import { TagBadge } from './tag-badge'

export function PostCard({ post, onChanged }: { post: Post; onChanged?: (...args: unknown[]) => void }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
      onClick={() => router.push(`/community/post/${post.id}`)}
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge>{CHANNEL_LABELS[post.channel] || post.channel}</Badge>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
        </div>
        <Link href={`/community/post/${post.id}`} className="text-lg font-semibold leading-snug hover:text-primary">
          {post.title}
        </Link>
        <p className="line-clamp-2 text-sm text-muted-foreground">{truncate(post.content, 160)}</p>

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {post.tags.map((tag) => (
              <TagBadge key={tag} name={tag} size="sm" />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Avatar className="size-6">
              <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(post.author.username)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">{post.author.username}</span>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="size-3.5" />
              {post.viewCount}
            </span>
            <div className="inline-flex">
              <BookmarkButton id={post.id} bookmarked={post.bookmarked} onChanged={onChanged} />
            </div>
            <div className="inline-flex">
              <LikeButton target="post" id={post.id} likeCount={post.likeCount} liked={post.liked} onChanged={onChanged} />
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageCircle className="size-3.5" />
              {post.commentCount}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
