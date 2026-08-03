'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { getInitials } from '@/lib/utils'
import type { FollowGroup, Paginated, PublicUser } from 'shared'

function UserListItem({ user }: { user: PublicUser }) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const { username } = useParams<{ username: string }>()

  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      following
        ? api.post<void>(`/users/${encodeURIComponent(user.username)}/follow`)
        : api.del<void>(`/users/${encodeURIComponent(user.username)}/follow`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['following', username] })
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

function FollowGroupManager() {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  const query = useQuery({
    queryKey: ['follow-groups'],
    queryFn: () => api.get<{ items: FollowGroup[] }>('/follow-groups'),
    enabled: !!token,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<FollowGroup>('/follow-groups', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-groups'] })
      toast.success('分组已创建')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '创建失败'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put<FollowGroup>(`/follow-groups/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-groups'] })
      toast.success('分组已重命名')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '重命名失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/follow-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-groups'] })
      toast.success('分组已删除')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '删除失败'),
  })

  const handleCreate = () => {
    const name = window.prompt('输入分组名称')
    if (name && name.trim()) {
      createMutation.mutate(name.trim())
    }
  }

  const handleRename = (group: FollowGroup) => {
    const name = window.prompt('输入新名称', group.name)
    if (name && name.trim() && name.trim() !== group.name) {
      renameMutation.mutate({ id: group.id, name: name.trim() })
    }
  }

  const handleDelete = (group: FollowGroup) => {
    if (window.confirm('确定删除？关注用户将移至未分组')) {
      deleteMutation.mutate(group.id)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-medium">关注分组</h2>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={createMutation.isPending}
          onClick={handleCreate}
        >
          <Plus className="size-3" />
          新建分组
        </Button>
      </div>
      <div className="border-t border-border px-4 py-3">
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            加载分组…
          </div>
        ) : query.isError ? (
          <p className="text-xs text-muted-foreground">分组加载失败</p>
        ) : query.data && query.data.items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {query.data.items.map((group) => (
              <Badge key={group.id} className="gap-1 py-0.5 pl-2.5 pr-1">
                <span>{group.name}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                  aria-label="重命名分组"
                  disabled={renameMutation.isPending}
                  onClick={() => handleRename(group)}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                  aria-label="删除分组"
                  disabled={deleteMutation.isPending}
                  onClick={() => handleDelete(group)}
                >
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">还没有分组，点击「新建分组」创建</p>
        )}
      </div>
    </Card>
  )
}

export default function FollowingPage() {
  const { username } = useParams<{ username: string }>()
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const isOwn = !!token && user?.username === username
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['following', username, page],
    queryFn: () => api.get<Paginated<PublicUser>>(`/following/${encodeURIComponent(username)}?page=${page}&pageSize=20`),
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
      <h1 className="text-xl font-semibold">{username} 的关注</h1>

      {isOwn && <FollowGroupManager />}

      {query.data.items.length === 0 ? (
        <Card className="border-dashed">
          <div className="p-10 text-center text-sm text-muted-foreground">还没有关注任何人</div>
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
