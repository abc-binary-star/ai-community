'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Flame, Loader2, Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import type { DiscoverResponse, PublicUser } from 'shared'
import { PostCard } from '../components/post-card'
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

export default function DiscoverPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const hydrated = useHydrated()
  const token = useAuthStore((s) => s.token)

  const discoverQuery = useQuery({
    queryKey: ['discover'],
    queryFn: () => api.get<DiscoverResponse>('/discover'),
  })

  if (discoverQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载发现页…
      </div>
    )
  }
  if (discoverQuery.isError || !discoverQuery.data) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">加载失败，请稍后重试</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community">返回社区</Link>
        </Button>
      </div>
    )
  }

  const { hotPosts, trendingTags, recommendedUsers } = discoverQuery.data

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">发现</h1>
        <span className="text-sm text-muted-foreground">社区热门内容与趋势</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* 主列：热门帖子 */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Flame className="size-4 text-orange-500" />
            热门帖子
          </h2>
          {hotPosts.length === 0 ? (
            <Card className="border-dashed">
              <div className="p-10 text-center text-sm text-muted-foreground">还没有热门内容，快去发帖吧</div>
            </Card>
          ) : (
            hotPosts.map((post) => (
              <PostCard key={post.id} post={post} onChanged={() => queryClient.invalidateQueries({ queryKey: ['posts'] })} />
            ))
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
