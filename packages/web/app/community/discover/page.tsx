'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import type { DiscoverResponse, Paginated, Post, PublicUser } from 'shared'
import { PostCard } from '../components/post-card'
import { SortTabs } from '../components/sort-tabs'
import { TagBadge } from '../components/tag-badge'

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
    <div className="flex items-center gap-3 py-2">
      <Avatar className="size-9">
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
          className="h-7 px-3 text-xs"
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
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community/discover">重新加载</Link>
        </Button>
      </div>
    )
  }

  const posts = postsQuery.data.items
  const trendingTags = discoverQuery.data?.trendingTags ?? []
  const recommendedUsers = discoverQuery.data?.recommendedUsers ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">发现</h1>
        <span className="text-sm text-muted-foreground">社区热门内容与趋势</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* 主列：帖子列表（热门/最新切换） */}
        <div className="space-y-4">
          <SortTabs current={sort} basePath="/community/discover" />

          {posts.length === 0 ? (
            <Card className="border-dashed">
              <div className="p-10 text-center text-sm text-muted-foreground">还没有内容，快去发帖吧</div>
            </Card>
          ) : (
            <div className="grid gap-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onChanged={() => queryClient.invalidateQueries({ queryKey: ['discover-posts'] })} />
              ))}
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

        {/* 侧栏：趋势话题 + 推荐用户 */}
        <div className="space-y-5">
          <Card>
            <div className="p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <TrendingUp className="size-4 text-primary" />
                趋势话题
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {trendingTags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">暂无热门话题</span>
                ) : (
                  trendingTags.map((tag) => (
                    <Link key={tag.name} href={`/community?tag=${encodeURIComponent(tag.name)}`}>
                      <TagBadge name={tag.name} size="md" />
                    </Link>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Users className="size-4 text-primary" />
                推荐关注
              </h2>
              <div className="mt-1 divide-y divide-border">
                {recommendedUsers.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">暂无推荐用户</p>
                ) : (
                  recommendedUsers.map((u) => <RecommendedUserItem key={u.id} user={u} />)
                )}
              </div>
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
