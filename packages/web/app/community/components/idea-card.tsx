'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, MessageSquare, Quote } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { channelColor } from '@/lib/channel-colors'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { getChannelLabel, type IdeaCard as IdeaCardData } from 'shared'

/**
 * 想法流中的一张卡。
 *
 * 三条硬约束（对齐设计文档 9 节）：
 *   1. 摘录是视觉主体，不能被想法正文挤成小字注释；
 *   2. 必须携带来源帖子标题与作者，不存在无来源的卡；
 *   3. 点击落回原文并定位该段，而不是停留在想法自身。
 */
export function IdeaCard({ card }: { card: IdeaCardData }) {
  const router = useRouter()
  const { data: channels } = useChannels()
  const color = channelColor(card.post.channel)
  const channelLabel = getChannelLabel(channels, card.post.channel)

  // 落点是原文的那一段，不是想法详情页
  const target = `/community/post/${card.post.id}?anchor=${encodeURIComponent(card.anchor)}`

  return (
    <Card
      className="channel-stripe group cursor-pointer overflow-hidden border-border/70 transition-colors duration-200 hover:border-primary/30 hover:shadow-card-hover"
      style={{ ['--stripe-color' as string]: color.stripe }}
      onClick={() => router.push(target)}
    >
      <div className="flex flex-col gap-3 p-4 pl-5 sm:p-5 sm:pl-6">
        {/* 摘录：卡片的视觉主体，衬线体强化"读物"气质 */}
        <blockquote className="relative rounded-lg border-l-2 border-primary/40 bg-muted/50 py-3 pl-4 pr-3">
          <Quote className="absolute -left-px -top-1 size-3.5 text-primary/40" aria-hidden />
          <p className="font-serifcn text-base leading-relaxed text-foreground/90">{card.excerpt}</p>
        </blockquote>

        {/* 人的判断：仅想法卡有 */}
        {card.type === 'idea' && card.body && (
          <div className="flex items-start gap-2.5">
            {card.author && (
              <Avatar className="mt-0.5 size-7 shrink-0">
                <AvatarImage src={card.author.avatar ?? undefined} alt={card.author.username} />
                <AvatarFallback className="text-xs">{getInitials(card.author.username)}</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
              {card.author && (
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{card.author.username}</span>
                  {card.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(card.createdAt)}
                    </span>
                  )}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {card.body}
              </p>
            </div>
          </div>
        )}

        {/* 摘录卡没有人声，明确标注来源是正文节选，不伪装成有人评论过 */}
        {card.type === 'excerpt' && (
          <p className="text-xs text-muted-foreground">正文节选 · 还没有人写下想法</p>
        )}

        {/* 来源与互动 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                color.chip,
                color.border,
              )}
            >
              <span className={cn('size-1.5 rounded-full', color.dot)} />
              {channelLabel}
            </span>
            <Link
              href={target}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              来自《{card.post.title}》· {card.post.author.username}
            </Link>
          </div>

          {card.type === 'idea' && (
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <Link
                href={`/community/idea/${card.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                title="查看这条想法"
              >
                <MessageSquare className="size-3.5" aria-hidden />
                {card.replyCount}
              </Link>
              <span className="inline-flex items-center gap-1">
                <Heart className={cn('size-3.5', card.liked && 'fill-current text-rose-500')} aria-hidden />
                {card.likeCount}
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
