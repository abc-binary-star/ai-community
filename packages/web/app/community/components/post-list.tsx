'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, PenLine, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { channelColor } from '@/lib/channel-colors'
import { cn } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { DiscoverFeed } from './discover-feed'
import { SortTabs } from './sort-tabs'
import { TagBadge } from './tag-badge'
import { IdeaFeed } from './idea-feed'
import type { IdeaFeedSort } from '@/lib/use-idea-feed'
import { getChannelLabel, type Paginated, type Post } from 'shared'

const HOT_TAGS_FALLBACK = ['AI', 'LLM', '前端', '后端', '产品', '设计', '游戏', '开源']

export function PostListPage({
  channel,
  page,
  sort = 'latest',
  q = '',
  tag = '',
  view = 'posts',
  ideaSort = 'hot',
}: {
  channel: string
  page: number
  sort?: string
  q?: string
  tag?: string
  view?: 'posts' | 'ideas'
  ideaSort?: IdeaFeedSort
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: channels } = useChannels()
  const color = channelColor(channel)

  // 视图切换走 URL：想法流与帖子列表都可被直接分享和刷新保留
  const setView = (next: 'posts' | 'ideas') => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'ideas') params.set('view', 'ideas')
    else params.delete('view')
    params.delete('page')
    router.push(`/community?${params.toString()}`)
  }

  const setIdeaSort = (next: IdeaFeedSort) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', 'ideas')
    params.set('ideaSort', next)
    router.push(`/community?${params.toString()}`)
  }

  const queryParams = new URLSearchParams()
  queryParams.set('channel', channel)
  queryParams.set('page', String(page))
  queryParams.set('sort', sort)
  if (q) queryParams.set('q', q)
  if (tag) queryParams.set('tag', tag)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posts', channel, page, sort, q, tag],
    queryFn: () =>
      api.get<Paginated<Post>>(`/posts?${queryParams.toString()}&pageSize=20`),
    enabled: view === 'posts',
  })

  // 动态获取热门标签，fallback 到预设列表
  const { data: tagsData } = useQuery({
    queryKey: ['popular-tags'],
    queryFn: () => api.get<{ items: { name: string; postCount: number }[] }>('/posts/tags/popular'),
    staleTime: 60 * 1000,
  })
  const hotTags = (tagsData?.items?.length ?? 0) > 0
    ? tagsData!.items.map((t) => t.name)
    : HOT_TAGS_FALLBACK

  const totalPages = data?.totalPages ?? 0

  const goPage = (n: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(n))
    router.push(`/community?${params.toString()}`)
  }

  return (
    <div className="flex gap-8">
      {/* 主栏：帖子列表 */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* 频道标题头：编辑式版面。频道色做一道竖线锚点，去卡片框，靠字号与留白。 */}
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className={cn('h-9 w-1 rounded-full', color.dot)} />
          <div>
            <h1 className="font-display text-3xl leading-none tracking-tight">{getChannelLabel(channels, channel)}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">分享与讨论，找到同好</p>
          </div>
        </div>

        {/* 视图切换：想法流用于发现和闲逛，帖子列表用于带着目的找文章。
            两者并存的成本很低，删掉任何一个都是过度自信。 */}
        <div className="flex items-center gap-1 rounded-full border bg-card p-1">
          <button
            type="button"
            onClick={() => setView('posts')}
            className={cn(
              'flex-1 rounded-full px-4 py-1.5 text-sm transition-colors',
              view === 'posts'
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            按帖子浏览
          </button>
          <button
            type="button"
            onClick={() => setView('ideas')}
            className={cn(
              'flex-1 rounded-full px-4 py-1.5 text-sm transition-colors',
              view === 'ideas'
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            想法流
          </button>
        </div>

        {view === 'posts' && (
        <div className="flex items-center justify-between gap-3">
          <SortTabs current={sort} />
          <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
            <Link href="/community/post/new">
              <PenLine />
              发帖
            </Link>
          </Button>
        </div>
        )}

        {/* 移动端：热门标签横向滚动 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">热门标签</span>
          <div className="flex gap-1.5">
            {hotTags.map((t) => (
              <TagBadge key={t} name={t} selected={tag === t} size="sm" channel={channel} />
            ))}
          </div>
        </div>

        {view === 'ideas' ? (
          <IdeaFeed sort={ideaSort} onSortChange={setIdeaSort} />
        ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" />
          加载中…
        </div>
      ) : isError ? (
        <div className="py-20 text-center text-muted-foreground">加载失败：{(error as Error).message}</div>
      ) : data && data.items.length > 0 ? (
        <DiscoverFeed posts={data.items} />
      ) : (
        <div className="rounded-2xl border border-dashed bg-card/50 py-20 text-center">
          <p className="text-muted-foreground">
            {q || tag ? '没有找到匹配的帖子' : '这个频道还没有帖子'}
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link href="/community/post/new">
              <PenLine />
              抢先发帖
            </Link>
          </Button>
        </div>
      )}

      {view === 'posts' && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" className="rounded-full" disabled={page <= 1} onClick={() => goPage(page - 1)}>
            <ChevronLeft />
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button variant="outline" size="sm" className="rounded-full" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
            下一页
            <ChevronRight />
          </Button>
        </div>
      )}
      </div>

      {/* 侧边栏 */}
      <aside className="hidden w-72 shrink-0 space-y-6 xl:block">
        <Card className="overflow-hidden">
          <div className="space-y-3 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ScrollText className="size-4 text-primary" />
              社区公约
            </p>
            <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary">·</span>友善交流，尊重不同观点</li>
              <li className="flex gap-2"><span className="text-primary">·</span>发布原创内容，注明来源</li>
              <li className="flex gap-2"><span className="text-primary">·</span>技术讨论请使用代码块格式</li>
              <li className="flex gap-2"><span className="text-primary">·</span>避免刷屏和重复发帖</li>
            </ul>
          </div>
        </Card>

        <Card>
          <div className="space-y-3 p-5">
            <h3 className="text-sm font-semibold">热门标签</h3>
            <div className="flex flex-wrap gap-2">
              {hotTags.map((t) => (
                <TagBadge key={t} name={t} selected={tag === t} size="sm" channel={channel} />
              ))}
            </div>
          </div>
        </Card>
      </aside>
    </div>
  )
}
