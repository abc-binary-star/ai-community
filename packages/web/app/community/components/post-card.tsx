'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, MessageCircle, Pin, Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatRelativeTime, getInitials, truncateMarkdown } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { getChannelLabel, type Post } from 'shared'
import { LikeButton } from './like-button'
import { BookmarkButton } from './bookmark-button'
import { ShareButton } from './share-button'
import { TagBadge } from './tag-badge'

export function PostCard({ post, onChanged }: { post: Post; onChanged?: (...args: unknown[]) => void }) {
  const router = useRouter()
  const { data: channels } = useChannels()

  return (
    <Card
      className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
      onClick={() => router.push(`/community/post/${post.id}`)}
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {post.isPinned && (
              <Badge className="border-transparent bg-amber-500/10 text-amber-600">
                <Pin className="size-3" />
                置顶
              </Badge>
            )}
            {post.isFeatured && (
              <Badge className="border-transparent bg-purple-500/10 text-purple-600">
                <Star className="size-3" />
                精华
              </Badge>
            )}
            <Badge>{getChannelLabel(channels, post.channel)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
        </div>
        <Link href={`/community/post/${post.id}`} className="text-lg font-semibold leading-snug hover:text-primary">
          {post.title}
        </Link>
        {post.coverUrl && (
          <img
            src={post.coverUrl}
            alt={post.title}
            className="aspect-video w-full rounded-lg object-cover"
            loading="lazy"
          />
        )}
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {post.aiSummary || truncateMarkdown(post.content, 160)}
        </p>

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
              {post.author.avatar && <AvatarImage src={post.author.avatar} alt={post.author.username} />}
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
            <div className="inline-flex">
              <ShareButton postId={post.id} title={post.title} />
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
