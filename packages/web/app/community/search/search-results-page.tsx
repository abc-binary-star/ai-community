'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock, FileText, LayoutGrid, Loader2, MessageCircle, Search, Target, Users, type LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useChannels } from '@/lib/use-channels'
import { cn, formatRelativeTime, getInitials, truncateMarkdown } from '@/lib/utils'
import { CHANNELS, CHANNEL_LABELS, getChannelLabel, type Comment, type Paginated, type Post, type PublicUser } from 'shared'
import { SearchBar } from '../components/search-bar'

// 搜索返回的评论结果可能带有关联帖子标题
type CommentSearchItem = Comment & { postTitle?: string }

// scope=all 时 API 返回的分组结构
interface AllSearchResult {
  posts: { items: Post[]; total: number }
  comments: { items: CommentSearchItem[]; total: number }
  users: { items: PublicUser[]; total: number }
}

type SearchResult = AllSearchResult | Paginated<Post> | Paginated<CommentSearchItem> | Paginated<PublicUser>

const SCOPES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: '全部', icon: LayoutGrid },
  { key: 'posts', label: '帖子', icon: FileText },
  { key: 'comments', label: '评论', icon: MessageCircle },
  { key: 'users', label: '用户', icon: Users },
]

const SORTS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'relevance', label: '相关度', icon: Target },
  { key: 'latest', label: '最新', icon: Clock },
]

// 关键词高亮：将命中关键词用 <mark> 标签包裹
function highlightText(text: string, keyword: string): ReactNode {
  const terms = keyword.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return text
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((part, i) =>
    terms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-yellow-200/80 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function PostResultCard({ post, keyword, channels }: { post: Post; keyword: string; channels: ReturnType<typeof useChannels>['data'] }) {
  return (
    <Card className="transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge>{getChannelLabel(channels, post.channel)}</Badge>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
        </div>
        <Link href={`/community/post/${post.id}`} className="text-lg font-semibold leading-snug hover:text-primary">
          {highlightText(post.title, keyword)}
        </Link>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {highlightText(truncateMarkdown(post.content, 160), keyword)}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Avatar className="size-6">
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
              {getInitials(post.author.username)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">{post.author.username}</span>
        </div>
      </div>
    </Card>
  )
}

function CommentResultCard({ comment, keyword }: { comment: CommentSearchItem; keyword: string }) {
  return (
    <Card className="border-l-2 border-l-primary">
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
              {getInitials(comment.author.username)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{comment.author.username}</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p className="break-words text-sm leading-6 text-foreground/90">
          {highlightText(truncateMarkdown(comment.content, 200), keyword)}
        </p>
        <Link
          href={`/community/post/${comment.postId}`}
          className="text-xs text-muted-foreground hover:text-primary"
        >
          {comment.postTitle ? `回复于：${highlightText(comment.postTitle, keyword)}` : '查看原帖'}
        </Link>
      </div>
    </Card>
  )
}

function UserResultCard({ user, keyword }: { user: PublicUser; keyword: string }) {
  return (
    <Card className="transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
      <Link href={`/u/${encodeURIComponent(user.username)}`} className="flex items-center gap-3 p-4">
        <Avatar className="size-10">
          <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(user.username)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{highlightText(user.displayName || user.username, keyword)}</span>
            <span className="text-xs text-muted-foreground">@{highlightText(user.username, keyword)}</span>
          </div>
          {user.bio && <p className="truncate text-sm text-muted-foreground">{highlightText(user.bio, keyword)}</p>}
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{user.postCount} 帖子</span>
            <span>{user.followerCount} 粉丝</span>
          </div>
        </div>
      </Link>
    </Card>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (n: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft />
        上一页
      </Button>
      <span className="text-sm text-muted-foreground">
        第 {page} / {totalPages} 页
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页
        <ChevronRight />
      </Button>
    </div>
  )
}

export default function SearchResultsPage({
  q = '',
  scope: scopeProp,
  channel = '',
  author = '',
  from = '',
  to = '',
  sort: sortProp,
  page: pageProp,
}: {
  q?: string
  scope?: string
  channel?: string
  author?: string
  from?: string
  to?: string
  sort?: string
  page?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: channels } = useChannels()

  // 频道列表，API 加载前使用 fallback
  const channelItems = (channels && channels.length > 0)
    ? channels
    : CHANNELS.map((name) => ({ name, label: CHANNEL_LABELS[name] || name }))

  const scope = scopeProp || 'all'
  const sort = sortProp || 'relevance'
  const pageNum = Math.max(1, Math.floor(Number(pageProp) || 1))

  // 防抖输入的本地状态
  const [authorInput, setAuthorInput] = useState(author)
  const [fromInput, setFromInput] = useState(from)
  const [toInput, setToInput] = useState(to)
  const authorTouched = useRef(false)
  const fromTouched = useRef(false)
  const toTouched = useRef(false)

  const buildUrl = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(changes).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    params.delete('page')
    const qs = params.toString()
    return qs ? `/community/search?${qs}` : '/community/search'
  }

  const updateParam = (key: string, val: string | null) => {
    router.push(buildUrl({ [key]: val }))
  }

  const handleAuthorChange = (v: string) => {
    authorTouched.current = true
    setAuthorInput(v)
  }
  const handleFromChange = (v: string) => {
    fromTouched.current = true
    setFromInput(v)
  }
  const handleToChange = (v: string) => {
    toTouched.current = true
    setToInput(v)
  }

  // 防抖 500ms 提交到 URL
  useEffect(() => {
    if (!authorTouched.current) return
    const t = setTimeout(() => updateParam('author', authorInput || null), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorInput])

  useEffect(() => {
    if (!fromTouched.current) return
    const t = setTimeout(() => updateParam('from', fromInput || null), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInput])

  useEffect(() => {
    if (!toTouched.current) return
    const t = setTimeout(() => updateParam('to', toInput || null), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toInput])

  // 构建查询参数
  const queryParams = new URLSearchParams()
  if (q) queryParams.set('q', q)
  if (scope) queryParams.set('scope', scope)
  if (channel) queryParams.set('channel', channel)
  if (author) queryParams.set('author', author)
  if (from) queryParams.set('from', from)
  if (to) queryParams.set('to', to)
  if (sort) queryParams.set('sort', sort)
  queryParams.set('page', String(pageNum))
  queryParams.set('pageSize', '20')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['search', q, scope, channel, author, from, to, sort, pageNum],
    queryFn: () => api.get<SearchResult>(`/search?${queryParams.toString()}`),
    enabled: !!q.trim(),
  })

  const goPage = (n: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(n))
    const qs = params.toString()
    router.push(qs ? `/community/search?${qs}` : '/community/search')
  }

  const allResult = scope === 'all' ? (data as AllSearchResult | undefined) : undefined
  const postsPage = scope === 'posts' ? (data as Paginated<Post> | undefined) : undefined
  const commentsPage = scope === 'comments' ? (data as Paginated<CommentSearchItem> | undefined) : undefined
  const usersPage = scope === 'users' ? (data as Paginated<PublicUser> | undefined) : undefined

  const hasQuery = !!q.trim()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 顶部搜索栏 */}
      <div className="max-w-2xl">
        <SearchBar value={q} />
      </div>

      {/* 筛选面板 */}
      <div className="space-y-3">
        {/* 搜索范围 tabs */}
        <div className="inline-flex items-center rounded-lg bg-muted p-0.5">
          {SCOPES.map((tab) => {
            const active = scope === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => updateParam('scope', tab.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <tab.icon className="size-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* 其它筛选条件 */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={channel}
            onChange={(e) => updateParam('channel', e.target.value || null)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">全部频道</option>
            {channelItems.map((ch) => (
              <option key={ch.name} value={ch.name}>
                {ch.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={authorInput}
            onChange={(e) => handleAuthorChange(e.target.value)}
            placeholder="作者"
            className="h-9 w-36 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromInput}
              onChange={(e) => handleFromChange(e.target.value)}
              title="开始日期"
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">至</span>
            <input
              type="date"
              value={toInput}
              onChange={(e) => handleToChange(e.target.value)}
              title="结束日期"
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="inline-flex items-center rounded-lg bg-muted p-0.5">
            {SORTS.map((tab) => {
              const active = sort === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => updateParam('sort', tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 搜索结果区域 */}
      {!hasQuery ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="size-10 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">输入关键词开始搜索</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="animate-spin" />
          搜索中…
        </div>
      ) : isError ? (
        <div className="py-20 text-center text-muted-foreground">搜索失败：{(error as Error).message}</div>
      ) : scope === 'all' && allResult ? (
        allResult.posts.total === 0 && allResult.comments.total === 0 && allResult.users.total === 0 ? (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <p className="text-muted-foreground">没有找到匹配的结果</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 帖子 */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  帖子 <span className="text-sm font-normal text-muted-foreground">({allResult.posts.total})</span>
                </h2>
                {allResult.posts.total > 5 && (
                  <Link href={buildUrl({ scope: 'posts' })} className="text-sm text-primary hover:underline">
                    查看全部
                  </Link>
                )}
              </div>
              {allResult.posts.items.length > 0 ? (
                <div className="grid gap-3">
                  {allResult.posts.items.slice(0, 5).map((p) => (
                    <PostResultCard key={p.id} post={p} keyword={q} channels={channels} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">没有匹配的帖子</p>
              )}
            </section>

            {/* 评论 */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  评论 <span className="text-sm font-normal text-muted-foreground">({allResult.comments.total})</span>
                </h2>
                {allResult.comments.total > 5 && (
                  <Link href={buildUrl({ scope: 'comments' })} className="text-sm text-primary hover:underline">
                    查看全部
                  </Link>
                )}
              </div>
              {allResult.comments.items.length > 0 ? (
                <div className="grid gap-3">
                  {allResult.comments.items.slice(0, 5).map((c) => (
                    <CommentResultCard key={c.id} comment={c} keyword={q} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">没有匹配的评论</p>
              )}
            </section>

            {/* 用户 */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  用户 <span className="text-sm font-normal text-muted-foreground">({allResult.users.total})</span>
                </h2>
                {allResult.users.total > 5 && (
                  <Link href={buildUrl({ scope: 'users' })} className="text-sm text-primary hover:underline">
                    查看全部
                  </Link>
                )}
              </div>
              {allResult.users.items.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {allResult.users.items.slice(0, 5).map((u) => (
                    <UserResultCard key={u.id} user={u} keyword={q} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">没有匹配的用户</p>
              )}
            </section>
          </div>
        )
      ) : scope === 'posts' && postsPage ? (
        postsPage.items.length > 0 ? (
          <>
            <div className="grid gap-3">
              {postsPage.items.map((p) => (
                <PostResultCard key={p.id} post={p} keyword={q} channels={channels} />
              ))}
            </div>
            <Pagination page={pageNum} totalPages={postsPage.totalPages} onChange={goPage} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <p className="text-muted-foreground">没有找到匹配的帖子</p>
          </div>
        )
      ) : scope === 'comments' && commentsPage ? (
        commentsPage.items.length > 0 ? (
          <>
            <div className="grid gap-3">
              {commentsPage.items.map((c) => (
                <CommentResultCard key={c.id} comment={c} keyword={q} />
              ))}
            </div>
            <Pagination page={pageNum} totalPages={commentsPage.totalPages} onChange={goPage} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <p className="text-muted-foreground">没有找到匹配的评论</p>
          </div>
        )
      ) : scope === 'users' && usersPage ? (
        usersPage.items.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {usersPage.items.map((u) => (
                <UserResultCard key={u.id} user={u} keyword={q} />
              ))}
            </div>
            <Pagination page={pageNum} totalPages={usersPage.totalPages} onChange={goPage} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <p className="text-muted-foreground">没有找到匹配的用户</p>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <p className="text-muted-foreground">没有找到匹配的结果</p>
        </div>
      )}
    </div>
  )
}
