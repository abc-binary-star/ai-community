'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { Post } from 'shared'

/**
 * 相关讨论推荐区（F14）。
 * 详情页底部展示与当前帖子同频道 / 共享标签的其他帖子，
 * 增加浏览深度，引导用户进入相关话题。
 */
export function RelatedDiscussions({ postId }: { postId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['related-posts', postId],
    queryFn: () => api.get<Post[]>(`/posts/${postId}/related?limit=5`),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <h3 className="font-semibold text-sm">相关讨论</h3>
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const posts = data ?? []
  if (posts.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <h3 className="font-semibold text-sm">相关讨论</h3>
      </div>
      <div className="space-y-2">
        {posts.map((post) => (
          <Card key={post.id} className="p-3">
            <Link
              href={`/community/post/${post.id}`}
              className="group block min-w-0"
            >
              <p className="truncate font-medium text-sm group-hover:underline">
                {post.title}
              </p>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {post.commentCount}
                </span>
                {post.tags && post.tags.length > 0 && (
                  <span className="flex items-center gap-1 truncate">
                    {post.tags.slice(0, 3).map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </span>
                )}
              </div>
            </Link>
          </Card>
        ))}
      </div>
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link href={`/community?channel=${encodeURIComponent(posts[0]?.channel ?? 'general')}`}>
          查看该频道更多讨论
        </Link>
      </Button>
    </section>
  )
}
