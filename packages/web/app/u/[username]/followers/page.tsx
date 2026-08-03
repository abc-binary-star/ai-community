'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import type { Paginated, PublicUser } from 'shared'

function UserListItem({ user }: { user: PublicUser }) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const { username: rawUsername } = useParams<{ username: string }>()
  const username = decodeURIComponent(rawUsername)

  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      following
        ? api.post<void>(`/users/${encodeURIComponent(user.username)}/follow`)
        : api.del<void>(`/users/${encodeURIComponent(user.username)}/follow`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followers', username] })
      queryClient.invalidateQueries({ queryKey: ['user', username] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar className="size-10">
        <AvatarFallback className="bg-primary/10 text-sm text-primary">{getInitials(user.username)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <Link href={`/u/${encodeURIComponent(user.username)}`} className="truncate text-sm font-medium hover:underline">
          {user.username}
        </Link>
        {user.bio && <p className="truncate text-xs text-muted-foreground">{user.bio}</p>}
        <p className="text-xs text-muted-foreground">{user.followerCount} 粉丝 · {user.postCount} 帖子</p>
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

export default function FollowersPage() {
  const { username: rawUsername } = useParams<{ username: string }>()
  const username = decodeURIComponent(rawUsername)
  const hydrated = useHydrated()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['followers', username, page],
    queryFn: () => api.get<Paginated<PublicUser>>(`/followers/${encodeURIComponent(username)}?page=${page}&pageSize=20`),
  })

  if (!hydrated || query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载中…
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">加载失败</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community">返回社区</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href={`/u/${encodeURIComponent(username)}`}>
          <ArrowLeft />
          返回主页
        </Link>
      </Button>
      <h1 className="text-xl font-semibold">{username} 的粉丝</h1>

      {query.data.items.length === 0 ? (
        <Card className="border-dashed">
          <div className="p-10 text-center text-sm text-muted-foreground">还没有粉丝</div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border px-4">
            {query.data.items.map((u) => <UserListItem key={u.id} user={u} />)}
          </div>
        </Card>
      )}

      {query.data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">第 {page} / {query.data.totalPages} 页</span>
          <Button variant="outline" size="sm" disabled={page >= query.data.totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      )}
    </div>
  )
}
