'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { PostCard } from './post-card'
import { CHANNEL_LABELS, type Paginated, type Post } from 'shared'

// 帖子列表：杂志目录式，章节标题 + 细线分隔的条目流
export function PostListPage({ channel, page }: { channel: string; page: number }) {
  const router = useRouter()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posts', channel, page],
    queryFn: () =>
      api.get<Paginated<Post>>(`/posts?channel=${encodeURIComponent(channel)}&page=${page}&pageSize=20`),
  })

  const totalPages = data?.totalPages ?? 0
  const goPage = (n: number) => router.push(`/community?channel=${encodeURIComponent(channel)}&page=${n}`)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* 章节标题 */}
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-muted-foreground">§ 频道</p>
          <h1 className="mt-1 font-display text-4xl leading-none">{CHANNEL_LABELS[channel] || channel}</h1>
          <p className="mt-2 font-serif text-sm italic text-muted-foreground">分享与讨论</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/community/post/new">
            <PenLine />
            发帖
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-24 font-serif text-muted-foreground">
          <Loader2 className="animate-spin" />
          翻页中…
        </div>
      ) : isError ? (
        <div className="py-24 text-center font-serif text-muted-foreground">
          加载失败：{(error as Error).message}
        </div>
      ) : data && data.items.length > 0 ? (
        <div>
          {data.items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <div className="border-t border-dashed border-border py-24 text-center">
          <p className="font-serif italic text-muted-foreground">这里还是一片空白。</p>
          <Button asChild variant="link" className="mt-3">
            <Link href="/community/post/new">抢先写下第一篇 →</Link>
          </Button>
        </div>
      )}

      {/* 分页：极简文字 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-6 pt-4 font-sans text-sm">
          <Button variant="link" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
            <ChevronLeft />
            上一页
          </Button>
          <span className="font-serif italic text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button variant="link" size="sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
            下一页
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
