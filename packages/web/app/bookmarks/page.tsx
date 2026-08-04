'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookOpen, Folder, FolderPlus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { cn } from '@/lib/utils'
import { CommunityShell } from '@/app/community/components/community-shell'
import { PostCard } from '@/app/community/components/post-card'
import { toast } from 'sonner'
import { type BookmarkFolder, type Paginated, type Post } from 'shared'

type FolderFilter = 'all' | 'uncategorized' | string

export default function BookmarksPage() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<FolderFilter>('all')

  const foldersQuery = useQuery({
    queryKey: ['bookmark-folders'],
    queryFn: () => api.get<{ items: BookmarkFolder[] }>('/bookmarks/folders'),
    enabled: !!token,
  })

  const bookmarksQuery = useQuery({
    queryKey: ['bookmarks', selected],
    queryFn: () => {
      if (selected === 'all') return api.get<Paginated<Post>>('/bookmarks')
      return api.get<Paginated<Post>>(`/bookmarks?folderId=${encodeURIComponent(selected)}`)
    },
    enabled: !!token,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<BookmarkFolder>('/bookmarks/folders', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmark-folders'] })
      toast.success('收藏夹已创建')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : '创建失败'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put<BookmarkFolder>(`/bookmarks/folders/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmark-folders'] })
      toast.success('已重命名')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : '重命名失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/bookmarks/folders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmark-folders'] })
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast.success('收藏夹已删除')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : '删除失败'),
  })

  const handleCreate = () => {
    const name = window.prompt('输入收藏夹名称')
    if (!name?.trim()) return
    createMutation.mutate(name.trim())
  }

  const handleRename = (folder: BookmarkFolder) => {
    const name = window.prompt('输入新名称', folder.name)
    if (!name?.trim() || name.trim() === folder.name) return
    renameMutation.mutate({ id: folder.id, name: name.trim() })
  }

  const handleDelete = (folder: BookmarkFolder) => {
    if (!window.confirm('确定删除？收藏内容将移至未分类')) return
    if (selected === folder.id) setSelected('all')
    deleteMutation.mutate(folder.id)
  }

  if (!hydrated) {
    return (
      <CommunityShell>
        <div className="mx-auto max-w-md py-20 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        </div>
      </CommunityShell>
    )
  }

  if (!token || !user) {
    return (
      <CommunityShell>
        <div className="mx-auto max-w-md py-20 text-center">
          <Bookmark className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-muted-foreground">请先登录查看收藏</p>
          <Button asChild className="mt-4">
            <Link href="/login">去登录</Link>
          </Button>
        </div>
      </CommunityShell>
    )
  }

  const folders = foldersQuery.data?.items ?? []

  const renderItem = (
    id: FolderFilter,
    name: string,
    icon: React.ReactNode,
    folder?: BookmarkFolder,
  ) => {
    const isActive = selected === id
    return (
      <div
        key={id}
        className={cn(
          'group flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <button
          type="button"
          onClick={() => setSelected(id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {icon}
          <span className="truncate">{name}</span>
        </button>
        {folder && (
          <div
            className={cn(
              'flex items-center gap-0.5 transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100',
            )}
          >
            <button
              type="button"
              onClick={() => handleRename(folder!)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="重命名"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(folder!)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="删除"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <CommunityShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          <BookOpen className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold">我的收藏</h1>
        </div>

          <div className="flex flex-col gap-4 md:flex-row">
            {/* 收藏夹侧边栏 / 标签 */}
            <aside className="md:w-52 md:shrink-0">
              <div className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
                {renderItem('all', '全部收藏', <Bookmark className="size-4 shrink-0" />)}
                {renderItem('uncategorized', '未分类', <Folder className="size-4 shrink-0" />)}
                {folders.map((f) =>
                  renderItem(f.id, f.name, <Folder className="size-4 shrink-0" />, f),
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FolderPlus />
                )}
                新建收藏夹
              </Button>
            </aside>

            {/* 收藏列表 */}
            <div className="min-w-0 flex-1">
              {bookmarksQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
                  <Loader2 className="animate-spin" />
                  加载中…
                </div>
              ) : bookmarksQuery.isError ? (
                <Card className="border-dashed">
                  <div className="p-10 text-center text-muted-foreground">加载失败，请重试</div>
                </Card>
              ) : bookmarksQuery.data && bookmarksQuery.data.items.length > 0 ? (
                <div className="grid gap-3">
                  {bookmarksQuery.data.items.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onChanged={() =>
                        queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
                      }
                    />
                  ))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <div className="p-12 text-center">
                    <Bookmark className="mx-auto mb-4 size-10 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {selected === 'all' ? '还没有收藏任何帖子' : '此收藏夹为空'}
                    </p>
                    <Button asChild className="mt-4">
                      <Link href="/community/discover">去社区看看</Link>
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
      </div>
    </CommunityShell>
  )
}
