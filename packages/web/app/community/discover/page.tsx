'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, PenLine, Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { getInitials } from '@/lib/utils'
import type { DiscoverResponse, Paginated, Post, PublicUser } from 'shared'
import { PostCard } from '../components/post-card'
import { SortTabs } from '../components/sort-tabs'
import { TagBadge } from '../components/tag-badge'

// 发现页 hero：欢迎语 + 快捷发帖 + 彩色频道装饰
function DiscoverHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-orange-500 to-amber-400 p-6 text-white shadow-[0_12px_32px_-8px_rgba(230,90,40,0.4)] sm:p-8">
      {/* 漂浮的彩色圆点装饰 */}
      <div className="pointer-events-none absolute -right-6 -top-8 size-32 rounded-full bg-white/15 blur-xl" aria-hidden />
      <div className="pointer-events-none absolute right-24 top-4 size-3 rounded-full bg-emerald-300/80" aria-hidden />
      <div className="pointer-events-none absolute right-40 bottom-6 size-2.5 rounded-full bg-amber-200/90" aria-hidden />
      <div className="pointer-events-none absolute right-10 bottom-16 size-4 rounded-full bg-rose-200/70" aria-hidden />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-white/85">
            <Sparkles className="size-4" />
            欢迎来到 Commons
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-wide sm:text-4xl">
            发现新鲜有趣的想法
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-white/85">
            在技术、设计、游戏与生活方式里，找到同好，聊聊热爱。每一条分享都是一枚彩色贴纸。
          </p>
        </div>
        <Button
          asChild
          size="lg"
          className="shrink-0 self-start rounded-full border border-white/40 bg-white/95 text-primary shadow-lg transition-transform hover:scale-105 sm:self-center"
        >
          <Link href="/community/post/new">
            <PenLine />
            分享一个想法
          </Link>
        </Button>
      </div>
    </section>
  )
}

function RecommendedUserItem({ user }: { user: PublicUser }) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      following
        ? api.post<void>(`/users/${encodeURIComponent(user.username)}/follow`)
        : api.del<void>(`/users/${encodeURIComponent(user.username)}/follow`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover'] })
      queryClient.invalidateQueries({ queryKey: ['user', user.username] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar className="size-9 ring-1 ring-border/60">
        <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(user.username)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.username}</p>
        <p className="text-xs text-muted-foreground">{user.followerCount} 粉丝</p>
      </div>
      {token && (
        <Button
          variant={user.isFollowing ? 'outline' : 'default'}
          size="sm"
          className="h-7 rounded-full px-3 text-xs"
          disabled={followMutation.isPending}
          onClick={() => followMutation.mutate(!user.isFollowing)}
        >
          {followMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
          {user.isFollowing ? '已关注' : '关注'}
        </Button>
      )}
    </div>
  )
}

function DiscoverPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const sort = searchParams.get('sort') || 'hot'
  const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1))

  // 帖子列表（支持热门/最新排序切换）
  const postsQuery = useQuery({
    queryKey: ['discover-posts', sort, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('channel', 'all')
      params.set('sort', sort)
      params.set('page', String(page))
      return api.get<Paginated<Post>>(`/posts?${params.toString()}&pageSize=20`)
    },
  })

  // 发现页侧栏数据：趋势话题 + 推荐用户
  const discoverQuery = useQuery({
    queryKey: ['discover'],
    queryFn: () => api.get<DiscoverResponse>('/discover'),
  })

  const totalPages = postsQuery.data?.totalPages ?? 0

  const goPage = (n: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(n))
    router.push(`/community/discover?${params.toString()}`)
  }

  if (postsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载发现页…
      </div>
    )
  }
  if (postsQuery.isError || !postsQuery.data) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">加载失败，请稍后重试</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link href="/community/discover">重新加载</Link>
        </Button>
      </div>
    )
  }

  const posts = postsQuery.data.items
  const trendingTags = discoverQuery.data?.trendingTags ?? []
  const recommendedUsers = discoverQuery.data?.recommendedUsers ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <DiscoverHero />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Sparkles className="size-5 text-primary" />
          社区新鲜事
          <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
            · 热门内容与趋势
          </span>
        </h2>
        <SortTabs current={sort} basePath="/community/discover" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 主列：帖子列表 */}
        <div className="space-y-4">
          {posts.length === 0 ? (
            <Card className="border-dashed">
              <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
                <p>还没有内容，快去发第一张贴吧</p>
                <Button asChild size="sm" className="rounded-full">
                  <Link href="/community/post/new">
                    <PenLine />
                    发帖
                  </Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onChanged={() => queryClient.invalidateQueries({ queryKey: ['discover-posts'] })} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
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

        {/* 侧栏：趋势话题 + 推荐用户 */}
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-border/60 bg-gradient-to-r from-primary/5 to-amber-400/10 px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <TrendingUp className="size-4 text-primary" />
                趋势话题
              </h2>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-1.5">
                {trendingTags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">暂无热门话题</span>
                ) : (
                  trendingTags.map((tag, i) => (
                    <Link key={tag.name} href={`/community?tag=${encodeURIComponent(tag.name)}`}>
                      <TagBadge name={tag.name} size="md" channel={['tech', 'design', 'gaming', 'life', 'general'][i % 5]} />
                    </Link>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border/60 bg-gradient-to-r from-primary/5 to-amber-400/10 px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Users className="size-4 text-primary" />
                推荐关注
              </h2>
            </div>
            <div className="px-4 pb-2">
              {recommendedUsers.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">暂无推荐用户</p>
              ) : (
                recommendedUsers.map((u) => <RecommendedUserItem key={u.id} user={u} />)
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" />加载发现页…</div>}>
      <DiscoverPageInner />
    </Suspense>
  )
}
