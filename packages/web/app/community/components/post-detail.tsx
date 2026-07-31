'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { formatRelativeTime } from '@/lib/utils'
import { CHANNEL_LABELS, type Comment, type Post } from 'shared'
import { CommentTree } from './comment-tree'
import { CommentForm } from './comment-form'
import { toast } from 'sonner'

export function PostDetailView({ id }: { id: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<Post>(`/posts/${id}`),
  })
  const commentsQuery = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api.get<{ items: Comment[] }>(`/posts/${id}/comments`),
  })

  const handleDeletePost = async () => {
    if (!window.confirm('确定删除这篇帖子吗？删除后无法恢复。')) return
    try {
      await api.del(`/posts/${id}`)
      toast.success('已删除')
      router.push('/community')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  const refreshComments = () => {
    queryClient.invalidateQueries({ queryKey: ['comments', id] })
    queryClient.invalidateQueries({ queryKey: ['post', id] })
  }

  if (postQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 font-serif text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载中…
      </div>
    )
  }
  if (postQuery.isError || !postQuery.data) {
    return (
      <div className="py-24 text-center">
        <p className="font-serif italic text-muted-foreground">帖子不存在或加载失败</p>
        <Button asChild variant="link" className="mt-3">
          <Link href="/community">返回社区 →</Link>
        </Button>
      </div>
    )
  }

  const post = postQuery.data
  const isAuthor = !!user && user.id === post.author.id

  return (
    <article className="mx-auto max-w-3xl">
      <Button variant="link" size="sm" className="-ml-2 mb-6" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      {/* 文章头部 */}
      <header className="border-b border-border pb-6">
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-primary/80">
          {CHANNEL_LABELS[post.channel] || post.channel}
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight">{post.title}</h1>
        <div className="mt-4 flex items-center justify-between">
          <p className="font-serif text-sm italic text-muted-foreground">
            {post.author.username} · {formatRelativeTime(post.createdAt)}
          </p>
          {isAuthor && (
            <Button
              variant="link"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDeletePost}
            >
              <Trash2 />
              删除
            </Button>
          )}
        </div>
      </header>

      {/* 正文：衬线大行高阅读 */}
      <div className="whitespace-pre-wrap break-words py-8 font-serif text-[17px] leading-8 text-foreground/90">
        {post.content}
      </div>

      {/* 评论区 */}
      <section className="border-t border-border pt-8">
        <div className="mb-6 flex items-baseline gap-3">
          <h2 className="font-display text-2xl">评论</h2>
          {post.commentCount > 0 && (
            <span className="font-serif text-sm italic text-muted-foreground">· {post.commentCount}</span>
          )}
        </div>

        {token ? (
          <div className="mb-8">
            <CommentForm
              postId={id}
              replyTo={replyTo}
              onDone={() => {
                setReplyTo(null)
                refreshComments()
              }}
              onCancelReply={() => setReplyTo(null)}
            />
          </div>
        ) : (
          <div className="mb-8 border-t border-dashed border-border py-6 text-center font-serif text-sm text-muted-foreground">
            <Link href="/login" className="font-sans font-medium text-primary underline-offset-4 hover:underline">
              登录
            </Link>
            后即可参与评论
          </div>
        )}

        {commentsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 font-serif text-muted-foreground">
            <Loader2 className="animate-spin" />
            加载评论…
          </div>
        ) : commentsQuery.data && commentsQuery.data.items.length > 0 ? (
          <CommentTree
            comments={commentsQuery.data.items}
            currentUserId={user?.id}
            onReply={setReplyTo}
            onDeleted={refreshComments}
          />
        ) : (
          <p className="py-8 text-center font-serif italic text-muted-foreground">还没有评论，来说点什么吧。</p>
        )}
      </section>
    </article>
  )
}
