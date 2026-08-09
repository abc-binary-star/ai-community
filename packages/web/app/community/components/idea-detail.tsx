'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Heart, Link2, MessageSquare, Quote } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { channelColor } from '@/lib/channel-colors'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { useIdeaQuery } from '@/lib/use-idea-feed'
import { getChannelLabel } from 'shared'
import { IdeaChainView } from './idea-chain'

/**
 * 想法详情页：给单条想法一个可分享的独立地址。
 *
 * 顶部固定展示原文摘录与来源帖子入口——任何时候都不允许一条想法脱离它的原文
 * 单独存在。这是对抗「脱离上下文」的最后一道防线：摘录跑得比原文远、尖锐的话
 * 比完整论证传播得快，是引用转推早已验证过的失灵机制。
 */
export function IdeaDetailView({ id }: { id: string }) {
  const router = useRouter()
  const { data: channels } = useChannels()
  const { data: idea, isLoading, isError } = useIdeaQuery(id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载中…
      </div>
    )
  }

  if (isError || !idea) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">这条想法不存在或已不可见</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link href="/community?view=ideas">回到想法流</Link>
        </Button>
      </div>
    )
  }

  const color = channelColor(idea.post.channel)
  const channelLabel = getChannelLabel(channels, idea.post.channel)
  const readTarget = `/community/post/${idea.post.id}?anchor=${encodeURIComponent(idea.anchor)}`
  // 回应这条想法：跳回原文对应段落，预填一条指向本想法的引用边草稿
  const replyTarget =
    `/community/post/${idea.post.id}?anchor=${encodeURIComponent(idea.anchor)}` +
    `&replyToIdea=${encodeURIComponent(idea.id)}` +
    `&replyToPreview=${encodeURIComponent((idea.body || '').slice(0, 60))}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('链接已复制')
    } catch {
      toast.error('复制失败，请手动复制地址栏链接')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        返回
      </Button>

      <Card
        className="channel-stripe overflow-hidden"
        style={{ ['--stripe-color' as string]: color.stripe }}
      >
        <div className="space-y-4 p-6 pl-7">
          {/* 原文摘录：常驻顶部，视觉主体 */}
          <blockquote className="relative rounded-xl border-l-2 border-primary/40 bg-muted/40 py-3.5 pl-4 pr-3">
            <Quote className="absolute -left-px -top-1 size-3.5 text-primary/40" aria-hidden />
            <p className="text-base leading-relaxed text-foreground/90">{idea.excerpt}</p>
          </blockquote>

          {/* 人的判断 */}
          {idea.author && (
            <div className="flex items-start gap-3">
              <Avatar className="mt-0.5 size-9 shrink-0">
                <AvatarImage src={idea.author.avatar ?? undefined} alt={idea.author.username} />
                <AvatarFallback>{getInitials(idea.author.username)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium text-foreground">{idea.author.username}</span>
                  {idea.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(idea.createdAt)}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
                  {idea.body}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 border-t border-border/60 pt-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="size-4" aria-hidden />
              {idea.replyCount} 条回应
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Heart className={cn('size-4', idea.liked && 'fill-current text-rose-500')} aria-hidden />
              {idea.likeCount}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={copyLink}>
              <Link2 className="size-4" />
              复制链接
            </Button>
          </div>
        </div>
      </Card>

      {/* 来源：落回原文是主行动，不是次要链接 */}
      <Card className="p-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Quote className="size-3.5" />
          这条想法来自
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
              color.chip,
              color.border,
            )}
          >
            <span className={cn('size-1.5 rounded-full', color.dot)} />
            {channelLabel}
          </span>
          <Link
            href={`/community/post/${idea.post.id}`}
            className="font-medium text-foreground transition-colors hover:text-primary"
          >
            《{idea.post.title}》
          </Link>
          <span className="text-sm text-muted-foreground">by {idea.post.author.username}</span>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="w-full rounded-full sm:w-auto">
            <Link href={readTarget}>读原文这一段</Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-full sm:w-auto">
            <Link href={replyTarget}>回应这条想法</Link>
          </Button>
        </div>
      </Card>

      {/* 想法链：一次只呈现一条纵向路径，向上是它回应了谁，向下是它引出了什么 */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5" />
          想法链
        </p>
        <IdeaChainView id={id} />
      </Card>
    </div>
  )
}
