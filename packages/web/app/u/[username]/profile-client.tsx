'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Loader2, Settings, UserPlus, UserCheck } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { type Paginated, type Post, type PublicUser } from 'shared'
import { PostCard } from '@/app/community/components/post-card'

export function ProfileClient({ username }: { username: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const postPage = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1))

  const userQuery = useQuery({
    queryKey: ['user', username],
    queryFn: () => api.get<PublicUser>(`/users/${encodeURIComponent(username)}`),
  })

  const postsQuery = useQuery({
    queryKey: ['user-posts', username, postPage],
    queryFn: () =>
      api.get<Paginated<Post>>(`/users/${encodeURIComponent(username)}/posts?page=${postPage}&pageSize=20`),
    enabled: !!userQuery.data,
  })

  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      following
        ? api.post<void>(`/users/${encodeURIComponent(username)}/follow`)
        : api.del<void>(`/users/${encodeURIComponent(username)}/follow`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['user', username] })
      const prev = queryClient.getQueryData<PublicUser>(['user', username])
      if (prev) {
        queryClient.setQueryData(['user', username], {
          ...prev,
          isFollowing: !prev.isFollowing,
          followerCount: prev.isFollowing ? prev.followerCount - 1 : prev.followerCount + 1,
        })
      }
      return { prev }
    },
    onError: (e: unknown, _, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['user', username], context.prev)
      }
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    },
  })

  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载中…
      </div>
    )
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h2 className="text-xl font-semibold">用户不存在</h2>
        <p className="mt-2 text-sm text-muted-foreground">找不到用户 &quot;{username}&quot;</p>
        <Button asChild className="mt-6">
          <Link href="/community">返回社区</Link>
        </Button>
      </div>
    )
  }

  const user = userQuery.data
  const isSelf = hydrated && !!currentUser && currentUser.id === user.id

  const goPage = (n: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(n))
    router.push(`/u/${encodeURIComponent(username)}?${params.toString()}`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Avatar className="size-20">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.displayName || user.username} />}
              <AvatarFallback className="bg-primary/10 text-xl text-primary">
                {getInitials(user.displayName || user.username)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{user.displayName || user.username}</h1>
                <Badge variant="outline">@{user.username}</Badge>
              </div>

              {user.bio && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                <span>加入于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              {isSelf ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">
                    <Settings />
                    编辑资料
                  </Link>
                </Button>
              ) : hydrated && token ? (
                <Button
                  size="sm"
                  variant={user.isFollowing ? 'outline' : 'default'}
                  disabled={followMutation.isPending}
                  onClick={() => followMutation.mutate(!user.isFollowing)}
                >
                  {followMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : user.isFollowing ? (
                    <UserCheck />
                  ) : (
                    <UserPlus />
                  )}
                  {user.isFollowing ? '取消关注' : '关注'}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-6 border-t border-border pt-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-semibold">{user.postCount}</div>
              <div className="text-xs text-muted-foreground">帖子</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{user.followerCount}</div>
              <div className="text-xs text-muted-foreground">粉丝</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{user.followingCount}</div>
              <div className="text-xs text-muted-foreground">关注</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          {isSelf ? '我的帖子' : `${user.displayName || user.username} 的帖子`}
        </h2>

        {postsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="animate-spin" />
            加载中…
          </div>
        ) : postsQuery.data && postsQuery.data.items.length > 0 ? (
          <div className="grid gap-3">
            {postsQuery.data.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <div className="p-10 text-center text-muted-foreground">
              <Edit3 className="mx-auto mb-3 size-8 opacity-50" />
              <p>还没有发布过帖子</p>
            </div>
          </Card>
        )}

        {postsQuery.data && postsQuery.data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" disabled={postPage <= 1} onClick={() => goPage(postPage - 1)}>
              <ChevronLeft />
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              第 {postPage} / {postsQuery.data.totalPages} 页
            </span>
            <Button variant="outline" size="sm" disabled={postPage >= postsQuery.data.totalPages} onClick={() => goPage(postPage + 1)}>
              下一页
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
