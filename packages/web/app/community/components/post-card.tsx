'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, MessageCircle, Pin, Quote, Sparkles, Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { channelColor } from '@/lib/channel-colors'
import { cn, formatRelativeTime, getInitials, pullQuote, truncateMarkdown } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { getChannelLabel, type Post } from 'shared'
import { LikeButton } from './like-button'
import { BookmarkButton } from './bookmark-button'
import { ShareButton } from './share-button'
import { TagBadge } from './tag-badge'

// 卡片形态（对齐设计文档 §5.2 四种卡片）：
//   standard 标准卡 · hero 主推位（大图大标题）· quote 引文卡（无封面用大字引文做主视觉）
// 想法卡是独立组件 idea-card。此处三种形态共用元信息行与页脚，只换主视觉。
export type PostCardVariant = 'standard' | 'hero' | 'quote'

interface PostCardProps {
  post: Post
  variant?: PostCardVariant
  onChanged?: (...args: unknown[]) => void
}

export function PostCard({ post, variant = 'standard', onChanged }: PostCardProps) {
  const router = useRouter()
  const { data: channels } = useChannels()
  const color = channelColor(post.channel)
  const channelLabel = getChannelLabel(channels, post.channel)
  const href = `/community/post/${post.id}`

  return (
    <Card
      className={cn(
        'channel-stripe group flex cursor-pointer flex-col overflow-hidden border-border/70 transition-colors duration-200 hover:border-primary/30 hover:shadow-card-hover',
        variant === 'hero' && 'sm:flex-row',
      )}
      style={{ ['--stripe-color' as string]: color.stripe }}
      onClick={() => router.push(href)}
    >
      {/* hero：封面占左半，作为杂志式主图 */}
      {variant === 'hero' && post.coverUrl && (
        <div className="relative shrink-0 overflow-hidden sm:w-[46%]">
          <img
            src={post.coverUrl}
            alt={post.title}
            className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:h-full"
            loading="lazy"
          />
        </div>
      )}

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-3 p-5 pl-6',
          variant === 'hero' && 'sm:justify-center sm:p-7',
        )}
      >
        <MetaRow post={post} channelLabel={channelLabel} color={color} />

        <Link
          href={href}
          className={cn(
            'font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary',
            variant === 'hero' ? 'font-display text-2xl sm:text-3xl' : 'text-lg',
          )}
        >
          {post.title}
        </Link>

        <CardBody post={post} variant={variant} />

        {post.tags && post.tags.length > 0 && variant !== 'quote' && (
          <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {post.tags.slice(0, variant === 'hero' ? 5 : 3).map((tag) => (
              <TagBadge key={tag} name={tag} size="sm" channel={post.channel} />
            ))}
          </div>
        )}

        <CardFooter post={post} onChanged={onChanged} />
      </div>
    </Card>
  )
}

// 元信息行：频道胶囊 + 置顶/精华徽章 + 相对时间
function MetaRow({
  post,
  channelLabel,
  color,
}: {
  post: Post
  channelLabel: string
  color: ReturnType<typeof channelColor>
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium', color.chip, color.border)}>
          <span className={cn('size-1.5 rounded-full', color.dot)} />
          {channelLabel}
        </span>
        {post.isPinned && (
          <Badge variant="warning">
            <Pin className="size-3" />
            置顶
          </Badge>
        )}
        {post.isFeatured && (
          <Badge variant="default">
            <Star className="size-3" />
            精华
          </Badge>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
    </div>
  )
}

// 主视觉正文区：按形态切换
//   quote  → 大号衬线引文，把正文里最有分量的一句抬为主角（编辑气质）
//   其他   → 封面（standard 有封面时）/ AI 摘要 / 普通摘要
function CardBody({ post, variant }: { post: Post; variant: PostCardVariant }) {
  if (variant === 'quote') {
    const quote = pullQuote(post.content)
    return (
      <blockquote className="relative py-1 pl-5">
        <Quote className="absolute left-0 top-0 size-4 text-primary/40" aria-hidden />
        <p className="font-serifcn text-xl leading-relaxed text-foreground/90">{quote}</p>
      </blockquote>
    )
  }

  return (
    <>
      {/* standard 有封面才在正文上方铺图；hero 的图已在左侧 */}
      {variant === 'standard' && post.coverUrl && (
        <div className="overflow-hidden rounded-lg ring-1 ring-border/60">
          <img
            src={post.coverUrl}
            alt={post.title}
            className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        </div>
      )}

      {post.aiSummary ? (
        <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-accent/40 px-3.5 py-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className={cn('text-sm leading-relaxed text-foreground/80', variant === 'hero' ? 'line-clamp-3' : 'line-clamp-2')}>
            <span className="mr-1 font-medium text-primary">AI 摘要</span>
            {post.aiSummary}
          </p>
        </div>
      ) : (
        <p className={cn('text-sm leading-relaxed text-muted-foreground', variant === 'hero' ? 'line-clamp-3' : 'line-clamp-2')}>
          {truncateMarkdown(post.content, variant === 'hero' ? 200 : 160)}
        </p>
      )}
    </>
  )
}

// 页脚：作者 + 浏览/收藏/点赞/分享/评论
function CardFooter({ post, onChanged }: { post: Post; onChanged?: (...args: unknown[]) => void }) {
  return (
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
  )
}
