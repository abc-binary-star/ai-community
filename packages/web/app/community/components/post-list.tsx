'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useChannels } from '@/lib/use-channels'
import { PostCard } from './post-card'
import { SortTabs } from './sort-tabs'
import { TagBadge } from './tag-badge'
import { getChannelLabel, type Paginated, type Post } from 'shared'

const HOT_TAGS_FALLBACK = ['AI', 'LLM', '前端', '后端', '产品', '设计', '游戏', '开源']

export function PostListPage({
  channel,
  page,
  sort = 'latest',
  q = '',
  tag = '',
}: {
  channel: string
  page: number
  sort?: string
  q?: string
  tag?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: channels } = useChannels()

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
        <div>
          <h1 className="text-2xl font-semibold">{getChannelLabel(channels, channel)}</h1>
          <p className="text-sm text-muted-foreground">分享与讨论</p>
        </div>

        <SortTabs current={sort} />

        {/* 移动端：热门标签横向滚动 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">热门标签</span>
          <div className="flex gap-1.5">
            {hotTags.map((t) => (
              <TagBadge key={t} name={t} selected={tag === t} size="sm" />
            ))}
          </div>
        </div>

        {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" />
          加载中…
        </div>
      ) : isError ? (
        <div className="py-20 text-center text-muted-foreground">加载失败：{(error as Error).message}</div>
      ) : data && data.items.length > 0 ? (
        <div className="grid gap-3">
          {data.items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <p className="text-muted-foreground">
            {q || tag ? '没有找到匹配的帖子' : '这个频道还没有帖子'}
          </p>
          <Button asChild className="mt-4">
            <Link href="/community/post/new">
              <PenLine />
              抢先发帖
            </Link>
          </Button>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
            <ChevronLeft />
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
            下一页
            <ChevronRight />
          </Button>
        </div>
      )}
      </div>

      {/* 侧边栏 */}
      <aside className="hidden w-72 shrink-0 space-y-6 xl:block">
        <Card className="bg-primary/5">
          <div className="space-y-3 p-5">
            <p className="text-sm font-semibold">社区公约</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• 友善交流，尊重不同观点</li>
              <li>• 发布原创内容，注明来源</li>
              <li>• 技术讨论请使用代码块格式</li>
              <li>• 避免刷屏和重复发帖</li>
            </ul>
          </div>
        </Card>

        <Card>
          <div className="space-y-3 p-5">
            <h3 className="text-sm font-semibold">热门标签</h3>
            <div className="flex flex-wrap gap-2">
              {hotTags.map((t) => (
                <TagBadge key={t} name={t} selected={tag === t} size="sm" />
              ))}
            </div>
          </div>
        </Card>
      </aside>
    </div>
  )
}
