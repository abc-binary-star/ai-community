'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Eye, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { formatEditedTime, formatRelativeTime, getInitials } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { getChannelLabel, type Comment, type Paginated, type Post } from 'shared'
import { CommentTree } from './comment-tree'
import { CommentForm } from './comment-form'
import { LikeButton } from './like-button'
import { BookmarkButton } from './bookmark-button'
import { TagBadge } from './tag-badge'
import { toast } from 'sonner'

const COMMENT_PAGE_SIZE = 10

export function PostDetailView({ id }: { id: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [commentPage, setCommentPage] = useState(1)
  const { data: channels } = useChannels()

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<Post>(`/posts/${id}`),
  })
  const commentsQuery = useQuery({
    queryKey: ['comments', id, commentPage],
    queryFn: () =>
      api.get<Paginated<Comment>>(
        `/posts/${id}/comments?page=${commentPage}&pageSize=${COMMENT_PAGE_SIZE}`
      ),
  })

  const handleDeletePost = async () => {
    if (!window.confirm('确定删除这篇帖子吗？删除后无法恢复。')) return
    try {
      await api.del(`/posts/${id}`)
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      router.push('/community')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  const refreshComments = () => {
    queryClient.invalidateQueries({ queryKey: ['comments', id] })
    queryClient.invalidateQueries({ queryKey: ['post', id] })
  }

  const refreshPostLists = () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  }

  const handleBookmarkChanged = ({ bookmarked }: { bookmarked: boolean }) => {
    queryClient.setQueryData(['post', id], (old: Post | undefined) => {
      if (!old) return old
      return { ...old, bookmarked }
    })
    refreshPostLists()
  }

  const handleLikeChanged = ({ liked, likeCount }: { liked: boolean; likeCount: number }) => {
    queryClient.setQueryData(['post', id], (old: Post | undefined) => {
      if (!old) return old
      return { ...old, liked, likeCount }
    })
    refreshPostLists()
  }

  if (postQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
        加载中…
      </div>
    )
  }
  if (postQuery.isError || !postQuery.data) {
    const err = postQuery.error
    const errMsg = err instanceof ApiError
      ? (err.status === 404 ? '帖子不存在' : err.message)
      : '加载失败，请检查网络后重试'
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">{errMsg}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community">返回社区</Link>
        </Button>
      </div>
    )
  }

  const post = postQuery.data
  const isAuthor = hydrated && !!user && user.id === post.author.id

  // 合并已加载的所有评论页
  const allComments: Comment[] = []
  for (let p = 1; p <= commentPage; p++) {
    const pageData = queryClient.getQueryData<Paginated<Comment>>(['comments', id, p])
    if (pageData) {
      allComments.push(...pageData.items)
    }
  }
  const commentsData = commentsQuery.data
  const hasMoreComments = commentsData ? commentPage < commentsData.totalPages : false

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <Card>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <Badge>{getChannelLabel(channels, post.channel)}</Badge>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="size-3.5" />
                {post.viewCount}
              </span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold leading-snug">{post.title}</h1>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagBadge key={tag} name={tag} size="sm" />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(post.author.username)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{post.author.username}</span>
            </div>
            {isAuthor && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => router.push(`/community/post/${id}/edit`)}>
                  <Pencil />
                  编辑
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeletePost}>
                  <Trash2 />
                  删除帖子
                </Button>
              </div>
            )}
          </div>
          <div className="break-words border-t border-border pt-4 text-[15px] leading-7 text-foreground/90">
            <MarkdownRenderer content={post.content} />
          </div>
          {post.edited && (
            <p className="text-xs text-muted-foreground">已编辑于 {formatEditedTime(post.updatedAt)}</p>
          )}
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <LikeButton
              target="post"
              id={post.id}
              likeCount={post.likeCount}
              liked={post.liked}
              size="md"
              onChanged={handleLikeChanged}
            />
            <BookmarkButton
              id={post.id}
              bookmarked={post.bookmarked}
              size="md"
              onChanged={handleBookmarkChanged}
            />
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">评论 {post.commentCount > 0 ? `· ${post.commentCount}` : ''}</h2>

        {hydrated && token ? (
          <CommentForm
            postId={id}
            replyTo={replyTo}
            onDone={() => {
              setReplyTo(null)
              refreshComments()
            }}
            onCancelReply={() => setReplyTo(null)}
          />
        ) : (
          <Card className="border-dashed">
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                登录
              </Link>
              后即可参与评论与点赞
            </div>
          </Card>
        )}

        {commentsQuery.isLoading && commentPage === 1 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="animate-spin" />
            加载评论…
          </div>
        ) : commentsQuery.isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">评论加载失败，请稍后重试</p>
        ) : allComments.length > 0 ? (
          <>
            <CommentTree
              comments={allComments}
              currentUserId={user?.id}
              onReply={setReplyTo}
              onDeleted={refreshComments}
            />
            {hasMoreComments && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCommentPage((p) => p + 1)}
                  disabled={commentsQuery.isFetching}
                >
                  {commentsQuery.isFetching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  加载更多评论
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">还没有评论，来说点什么吧</p>
        )}
      </div>
    </div>
  )
}
