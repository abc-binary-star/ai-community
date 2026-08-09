'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, FileText, Heart, Loader2, MessageCircle, Settings, UserPlus, Users, UserCheck, Ban } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { toast } from 'sonner'
import { type Paginated, type Post, type PublicUser, getChannelLabel } from 'shared'
import { PostCard } from '@/app/community/components/post-card'
import { FollowButton } from '@/app/community/components/follow-button'

export function ProfileClient({ username }: { username: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const postPage = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1))
  const { data: channels } = useChannels()

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

  // 统一关注按钮：关注时可选分组，成功后乐观更新用户缓存
  const handleFollowChanged = ({ isFollowing }: { isFollowing: boolean }) => {
    queryClient.setQueryData(['user', username], (old: PublicUser | undefined) => {
      if (!old) return old
      return { ...old, isFollowing, followerCount: old.followerCount + (isFollowing ? 1 : -1) }
    })
    queryClient.invalidateQueries({ queryKey: ['user', username] })
    queryClient.invalidateQueries({ queryKey: ['user-posts', username] })
  }

  const blockMutation = useMutation({
    mutationFn: () => api.post<void>(`/users/${encodeURIComponent(username)}/block`),
    onSuccess: () => {
      toast.success(`已拉黑 ${username}`)
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  const handleBlock = () => {
    if (!window.confirm(`确定拉黑 ${username} 吗？拉黑后将不再看到 TA 的帖子与评论，可在设置页解除。`)) return
    blockMutation.mutate()
  }

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
          <Link href="/community/discover">返回社区</Link>
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
                {user.role === 'admin' && (
                  <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-transparent">管理员</Badge>
                )}
                {user.role === 'moderator' && (
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-transparent">版主</Badge>
                )}
              </div>

              {user.bio && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                <span>加入于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isSelf ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">
                    <Settings />
                    编辑资料
                  </Link>
                </Button>
              ) : hydrated && token ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/messages?user=${encodeURIComponent(user.id)}`)}
                  >
                    <MessageCircle />
                    发私信
                  </Button>
                  <FollowButton
                    username={username}
                    isFollowing={user.isFollowing}
                    onChanged={handleFollowChanged}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={blockMutation.isPending}
                    onClick={handleBlock}
                  >
                    {blockMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban />}
                    拉黑
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-2">
            <div className="grid grid-cols-4 divide-x divide-border/60">
              <div className="group flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors hover:bg-accent/50">
                <span className="text-xl font-bold tabular-nums leading-none text-foreground">{user.postCount}</span>
                <FileText className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="group flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors hover:bg-accent/50">
                <span className="text-xl font-bold tabular-nums leading-none text-foreground">{user.likeCount}</span>
                <Heart className="size-4 text-red-400 transition-colors group-hover:text-red-500" />
              </div>
              <Link
                href={`/u/${encodeURIComponent(username)}/followers`}
                className="group flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors hover:bg-accent/50"
              >
                <span className="text-xl font-bold tabular-nums leading-none text-foreground">{user.followerCount}</span>
                <Users className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </Link>
              <Link
                href={`/u/${encodeURIComponent(username)}/following`}
                className="group flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors hover:bg-accent/50"
              >
                <span className="text-xl font-bold tabular-nums leading-none text-foreground">{user.followingCount}</span>
                <UserPlus className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </Link>
            </div>
          </div>

          {user.channels && user.channels.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">活跃频道：</span>
              {user.channels.map((ch) => (
                <Link
                  key={ch}
                  href={`/community?channel=${encodeURIComponent(ch)}`}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-primary"
                >
                  {getChannelLabel(channels, ch)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="size-4 text-muted-foreground" />
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
