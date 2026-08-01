'use client'

import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { Navbar } from '@/app/community/components/navbar'
import { PostCard } from '@/app/community/components/post-card'
import { type Paginated, type Post } from 'shared'

export default function BookmarksPage() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => api.get<Paginated<Post>>('/bookmarks'),
    enabled: !!token,
  })

  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <div className="container flex-1 py-8">
          <div className="mx-auto max-w-md py-20 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  if (!token || !user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <div className="container flex-1 py-8">
          <div className="mx-auto max-w-md py-20 text-center">
            <Bookmark className="mx-auto mb-3 size-10 text-muted-foreground" />
            <p className="text-muted-foreground">请先登录查看收藏</p>
            <Button asChild className="mt-4">
              <Link href="/login">去登录</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <div className="container flex-1 py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-2">
            <BookOpen className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold">我的收藏</h1>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="animate-spin" />
              加载中…
            </div>
          ) : isError ? (
            <Card className="border-dashed">
              <div className="p-10 text-center text-muted-foreground">加载失败，请重试</div>
            </Card>
          ) : data && data.items.length > 0 ? (
            <div className="grid gap-3">
              {data.items.map((post) => (
                <PostCard key={post.id} post={post} onChanged={() => queryClient.invalidateQueries({ queryKey: ['bookmarks'] })} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <div className="p-12 text-center">
                <Bookmark className="mx-auto mb-4 size-10 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">还没有收藏任何帖子</p>
                <Button asChild className="mt-4">
                  <Link href="/community">去社区看看</Link>
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
