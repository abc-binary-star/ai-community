'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, ChevronUp, Eye, Notebook, Pencil, Pin, Sparkles, Star, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { channelColor } from '@/lib/channel-colors'
import { cn, formatEditedTime, formatRelativeTime, getInitials } from '@/lib/utils'
import { useChannels } from '@/lib/use-channels'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { HighlightableContent } from './highlightable-content'
import { NotesPanel } from './notes-panel'
import { fontFamily } from '@/lib/font-options'
import { getChannelLabel, type Post, type ThreadSummary } from 'shared'
import { WholeDiscussion } from './whole-discussion'
import { AssetPanel } from './asset-panel'
import { RelatedDiscussions } from './related-discussions'
import { LikeButton } from './like-button'
import { BookmarkButton } from './bookmark-button'
import { ShareButton } from './share-button'
import { TagBadge } from './tag-badge'
import { ReportButton } from './report-button'
import { toast } from 'sonner'

export function PostDetailView({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  // 带 ?anchor= 从想法流跳转进来时必须展开全文：折叠态渲染的是截断正文，
  // 段落锚点不存在，落点会停在折叠页上，等于跳转失败。
  const [contentExpanded, setContentExpanded] = useState(() => !!searchParams.get('anchor'))
  const [notesOpen, setNotesOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const { data: channels } = useChannels()

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<Post>(`/posts/${id}`),
  })

  // AI 讨论摘要 v2（按需生成：用户点击按钮才触发，不自动请求）
  const [summaryRequested, setSummaryRequested] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const summaryQuery = useQuery({
    queryKey: ['post-summary', id],
    queryFn: () => api.get<ThreadSummary>(`/posts/${id}/summary`),
    enabled: summaryRequested,
    refetchInterval: (query) => {
      // generating 状态或仍在生成中时每 3 秒轮询
      return query.state.data?.status === 'generating' || isGenerating ? 3000 : false
    },
  })

  const generateSummary = async () => {
    setSummaryRequested(true)
    setIsGenerating(true)
    try {
      await api.post(`/posts/${id}/summary`)
      queryClient.invalidateQueries({ queryKey: ['post-summary', id] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '生成摘要失败')
      setIsGenerating(false)
    }
  }

  // 摘要生成完成时，关闭 loading 状态（只有 done 才算完成）
  useEffect(() => {
    if (isGenerating && summaryQuery.data?.status === 'done') {
      setIsGenerating(false)
    }
  }, [isGenerating, summaryQuery.data])

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
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-9 w-24" />
        <Card>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-48 w-full" />
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </Card>
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
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
          <Link href="/community/discover">返回社区</Link>
        </Button>
      </div>
    )
  }

  const post = postQuery.data
  const color = channelColor(post.channel)
  const isAuthor = hydrated && !!user && user.id === post.author.id
  const canModerate = hydrated && !!user && (user.role === 'admin' || user.role === 'moderator')

  const handleTogglePin = async () => {
    try {
      await api.put(`/posts/${id}/status`, { isPinned: !post.isPinned })
      toast.success(post.isPinned ? '已取消置顶' : '已置顶')
      queryClient.invalidateQueries({ queryKey: ['post', id] })
      refreshPostLists()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  const handleToggleFeatured = async () => {
    try {
      await api.put(`/posts/${id}/status`, { isFeatured: !post.isFeatured })
      toast.success(post.isFeatured ? '已取消精华' : '已设为精华')
      queryClient.invalidateQueries({ queryKey: ['post', id] })
      refreshPostLists()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  // 长文折叠：超过 2000 字默认折叠（对齐 v2 规格）
  const isLongContent = post.content.length > 2000
  const showCollapsed = isLongContent && !contentExpanded

  const openNotes = () => {
    if (showCollapsed) setContentExpanded(true)
    setNotesOpen(true)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <Card>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {post.isPinned && (
                <Badge variant="warning">
                  <Pin className="size-3" />
                  置顶
                </Badge>
              )}
              {post.isFeatured && (
                <Badge variant="default">
                  <Star className="size-3" />
                  精华
                </Badge>
              )}
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium', color.chip, color.border)}>
                <span className={cn('size-1.5 rounded-full', color.dot)} />
                {getChannelLabel(channels, post.channel)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="size-3.5" />
                {post.viewCount}
              </span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold leading-snug">{post.title}</h1>
          {post.coverUrl && (
            <div className="aspect-video max-h-96 w-full overflow-hidden rounded-lg">
              <img
                src={post.coverUrl}
                alt={post.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {post.aiSummary && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-primary">
                <Sparkles className="size-4" />
                AI 摘要
              </div>
              <p className="text-sm leading-6 text-foreground/80">{post.aiSummary}</p>
            </div>
          )}

          {/* AI 讨论摘要：按需生成，用户点击按钮才触发；评论数需 >= 10 */}
          {!summaryRequested && post.commentCount >= 10 && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit gap-1.5 text-muted-foreground"
              onClick={generateSummary}
            >
              <Sparkles className="size-4" />
              生成讨论摘要
            </Button>
          )}

          {(isGenerating || summaryQuery.data?.status === 'generating') && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Sparkles className="size-4" />
                AI 讨论摘要
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">正在生成讨论摘要…</p>
            </div>
          )}

          {summaryQuery.data && summaryQuery.data.status === 'done' && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-primary">
                <Sparkles className="size-4" />
                AI 讨论摘要
                <span className="text-xs font-normal text-muted-foreground">
                  基于 {summaryQuery.data.commentCount} 条评论
                </span>
                {summaryQuery.data.stale && (
                  <span className="text-xs font-normal text-warning">
                    · 摘要可能不完整
                  </span>
                )}
              </div>
              <p className="text-sm leading-6 text-foreground/80">
                {summaryQuery.data.summary}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                AI 生成，仅供参考
              </p>
            </div>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagBadge key={tag} name={tag} size="sm" />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(post.author.username)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{post.author.username}</span>
              {post.author.role === 'admin' && (
                <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-transparent">管理员</Badge>
              )}
              {post.author.role === 'moderator' && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-transparent">版主</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {hydrated && token && (
                <Button variant="ghost" size="sm" onClick={openNotes}>
                  <Notebook />
                  我的笔记
                </Button>
              )}
              {(isAuthor || canModerate) && (
                <>
                  {canModerate && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleTogglePin}>
                        <Pin />
                        {post.isPinned ? '取消置顶' : '置顶'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleToggleFeatured}>
                        <Star />
                        {post.isFeatured ? '取消精华' : '精华'}
                      </Button>
                    </>
                  )}
                  {isAuthor && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/community/post/${id}/edit`)}>
                        <Pencil />
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeletePost}>
                        <Trash2 />
                        删除帖子
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div ref={contentRef} className="break-words border-t border-border pt-4 text-[15px] leading-7 text-foreground/90">
            {showCollapsed ? (
              <div className="relative">
                <div className="max-h-[32rem] overflow-hidden">
                  <MarkdownRenderer content={post.content.slice(0, 1500) + '…'} fontFamily={fontFamily(post.font)} />
                </div>
                <div className="mt-3 flex items-center justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setContentExpanded(true)}
                  >
                    <ChevronDown className="size-4" />
                    展开全文
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <HighlightableContent
                  postId={post.id}
                  content={post.content}
                  contentDoc={(post.contentDoc as import('@tiptap/core').JSONContent | undefined) ?? null}
                  fontFamily={fontFamily(post.font)}
                />
                {isLongContent && (
                  <div className="mt-3 flex items-center justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setContentExpanded(false)}
                    >
                      <ChevronUp className="size-4" />
                      收起
                    </Button>
                  </div>
                )}
              </>
            )}
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
            <ShareButton postId={post.id} title={post.title} size="md" />
            {!isAuthor && <ReportButton targetType="post" targetId={post.id} />}
          </div>
        </div>
      </Card>

      <RelatedDiscussions postId={post.id} />

      <WholeDiscussion postId={id} />

      <AssetPanel post={post} />

      {notesOpen && (
        <NotesPanel
          postId={post.id}
          containerRef={contentRef}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  )
}
