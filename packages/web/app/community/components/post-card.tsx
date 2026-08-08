'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, MessageCircle, Pin, Sparkles, Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { channelColor } from '@/lib/channel-colors'
import { cn, formatRelativeTime, getInitials, truncateMarkdown } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { getChannelLabel, type Post } from 'shared'
import { LikeButton } from './like-button'
import { BookmarkButton } from './bookmark-button'
import { ShareButton } from './share-button'
import { TagBadge } from './tag-badge'

export function PostCard({ post, onChanged }: { post: Post; onChanged?: (...args: unknown[]) => void }) {
  const router = useRouter()
  const { data: channels } = useChannels()
  const color = channelColor(post.channel)
  const channelLabel = getChannelLabel(channels, post.channel)

  return (
    <Card
      className="channel-stripe group cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
      style={{ ['--stripe-color' as string]: color.stripe }}
      onClick={() => router.push(`/community/post/${post.id}`)}
    >
      <div className="flex flex-col gap-3 p-5 pl-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 频道彩色胶囊 */}
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium', color.chip, color.border)}>
              <span className={cn('size-1.5 rounded-full', color.dot)} />
              {channelLabel}
            </span>
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
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
        </div>

        <Link href={`/community/post/${post.id}`} className="text-lg font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
          {post.title}
        </Link>

        {post.coverUrl && (
          <div className="overflow-hidden rounded-xl ring-1 ring-border/60">
            <img
              src={post.coverUrl}
              alt={post.title}
              className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
        )}

        {post.aiSummary ? (
          <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-gradient-to-r from-primary/5 to-amber-400/10 px-3.5 py-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">
              <span className="mr-1 font-medium text-primary">AI 摘要</span>
              {post.aiSummary}
            </p>
          </div>
        ) : (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {truncateMarkdown(post.content, 160)}
          </p>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {post.tags.map((tag) => (
              <TagBadge key={tag} name={tag} size="sm" channel={post.channel} />
            ))}
          </div>
        )}

        <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar className="size-6 ring-1 ring-border/50">
              {post.author.avatar && <AvatarImage src={post.author.avatar} alt={post.author.username} />}
              <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(post.author.username)}</AvatarFallback>
            </Avatar>
            <span className="truncate text-xs font-medium text-muted-foreground">{post.author.username}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
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
