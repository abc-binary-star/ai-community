'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, MessageCircle, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { cn, formatEditedTime, getInitials } from '@/lib/utils'
import { CommunityShell } from '@/app/community/components/community-shell'
import { toast } from 'sonner'
import type { Conversation, Message, Paginated } from 'shared'

const MESSAGES_PAGE_SIZE = 50

interface MessagesPageData {
  items: Message[]
  hasMore: boolean
}

function MessagesInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const currentUser = useAuthStore((s) => s.user)
  const hydrated = useHydrated()

  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [input, setInput] = useState('')

  const chatBodyRef = useRef<HTMLDivElement>(null)
  const hasLoadedOnce = useRef(false)

  // 从用户主页带 ?user=xxx 进入时自动发起会话
  const targetUser = searchParams.get('user')
  useEffect(() => {
    if (!targetUser || !token) return
    let cancelled = false
    ;(async () => {
      try {
        const conv = await api.post<Conversation>('/messages/conversations', { recipientId: targetUser })
        if (cancelled) return
        setActiveConvId(conv.id)
        setMobileView('chat')
        queryClient.invalidateQueries({ queryKey: ['messages-conversations'] })
        router.replace('/messages', { scroll: false })
      } catch (e) {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : '无法发起会话')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [targetUser, token, queryClient, router])

  // 会话列表（10s 轮询）
  const conversationsQuery = useQuery({
    queryKey: ['messages-conversations'],
    queryFn: () => api.get<Paginated<Conversation>>('/messages/conversations?page=1&pageSize=50'),
    enabled: !!token,
    refetchInterval: 10000,
  })

  // 未读总数（15s 轮询）
  const unreadQuery = useQuery({
    queryKey: ['messages-unread-count'],
    queryFn: () => api.get<{ count: number }>('/messages/unread-count'),
    enabled: !!token,
    refetchInterval: 15000,
  })

  const convs = conversationsQuery.data?.items ?? []
  const activeConv = convs.find((c) => c.id === activeConvId) ?? null

  // 消息列表（5s 轮询增量）
  const messagesQuery = useQuery({
    queryKey: ['messages', activeConvId],
    queryFn: () =>
      api.get<MessagesPageData>(`/messages/conversations/${activeConvId}/messages?pageSize=${MESSAGES_PAGE_SIZE}`),
    enabled: !!activeConvId && !!token,
    refetchInterval: 5000,
  })

  const messages = messagesQuery.data?.items ?? []
  const hasMore = messagesQuery.data?.hasMore ?? false

  // 打开会话时标记已读
  const openConversation = (convId: string) => {
    setActiveConvId(convId)
    setMobileView('chat')
    api.post(`/messages/conversations/${convId}/read`).catch(() => {})
    queryClient.invalidateQueries({ queryKey: ['messages-conversations'] })
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] })
  }

  // 新消息轮询到达时自动标记已读并刷新会话列表
  useEffect(() => {
    if (!activeConvId) return
    api.post(`/messages/conversations/${activeConvId}/read`).catch(() => {})
    queryClient.invalidateQueries({ queryKey: ['messages-conversations'] })
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, messages.length])

  // 切换会话时重置滚动标记
  useEffect(() => {
    hasLoadedOnce.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId])

  // 自动滚动：首次加载/新消息且接近底部时滚到底；加载更早消息由 loadEarlier 自行保持位置
  useEffect(() => {
    const body = chatBodyRef.current
    if (!body || messages.length === 0) return
    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true
      body.scrollTop = body.scrollHeight
      return
    }
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 120
    if (nearBottom) body.scrollTop = body.scrollHeight
  }, [messages.length, activeConvId])

  // 加载更早消息（保持滚动位置）
  const loadEarlier = async () => {
    if (!activeConvId || messages.length === 0) return
    const beforeId = messages[0].id
    const body = chatBodyRef.current
    const prevHeight = body?.scrollHeight ?? 0
    try {
      const data = await api.get<MessagesPageData>(
        `/messages/conversations/${activeConvId}/messages?pageSize=${MESSAGES_PAGE_SIZE}&beforeId=${encodeURIComponent(beforeId)}`,
      )
      queryClient.setQueryData<MessagesPageData>(['messages', activeConvId], {
        items: [...data.items, ...messages],
        hasMore: data.hasMore,
      })
      requestAnimationFrame(() => {
        if (body) body.scrollTop = body.scrollHeight - prevHeight
      })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '加载失败')
    }
  }

  // 发送消息（乐观更新）
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<Message>(`/messages/conversations/${activeConvId}/messages`, { content }),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ['messages', activeConvId] })
      const prev = queryClient.getQueryData<MessagesPageData>(['messages', activeConvId])
      const temp: Message = {
        id: `temp-${Date.now()}`,
        conversationId: activeConvId ?? '',
        senderId: currentUser?.id ?? '',
        senderName: currentUser?.username ?? '',
        senderAvatar: currentUser?.avatar ?? null,
        content,
        readAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<MessagesPageData>(['messages', activeConvId], {
        items: [...(prev?.items ?? []), temp],
        hasMore: prev?.hasMore ?? false,
      })
      return { prev }
    },
    onSuccess: (msg) => {
      const prev = queryClient.getQueryData<MessagesPageData>(['messages', activeConvId])
      if (prev) {
        queryClient.setQueryData<MessagesPageData>(['messages', activeConvId], {
          items: prev.items.map((m) => (m.id.startsWith('temp-') ? msg : m)),
          hasMore: prev.hasMore,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['messages-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] })
    },
    onError: (e: unknown, _content, context) => {
      if (context?.prev) {
        queryClient.setQueryData<MessagesPageData>(['messages', activeConvId], context.prev)
      }
      toast.error(e instanceof ApiError ? e.message : '发送失败')
    },
  })

  const handleSend = () => {
    const content = input.trim()
    if (!content || !activeConvId || sendMutation.isPending) return
    setInput('')
    sendMutation.mutate(content)
    requestAnimationFrame(() => {
      const body = chatBodyRef.current
      if (body) body.scrollTop = body.scrollHeight
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!hydrated || !token || !currentUser) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <MessageCircle className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-muted-foreground">请先登录查看私信</p>
          <Button asChild className="mt-4">
            <Link href="/login">去登录</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* 会话列表 */}
      <aside
        className={cn(
          'w-full flex-col border-r border-border bg-background sm:flex sm:w-80',
          mobileView === 'chat' ? 'hidden sm:flex' : 'flex',
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <MessageCircle className="size-5 text-primary" />
            私信
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversationsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载中…
            </div>
          ) : convs.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              <p>暂无会话</p>
              <p className="mt-2 text-xs text-muted-foreground/70">去用户主页点击「发私信」开始聊天</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {convs.map((conv) => (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(conv.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60',
                      activeConvId === conv.id && 'bg-accent/80',
                    )}
                  >
                    <Avatar className="size-10 shrink-0">
                      {conv.otherUser.avatar && (
                        <AvatarImage src={conv.otherUser.avatar} alt={conv.otherUser.username} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(conv.otherUser.displayName || conv.otherUser.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {conv.otherUser.displayName || conv.otherUser.username}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatEditedTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-xs',
                            conv.unreadCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {conv.lastMessage || '开始聊天吧'}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 聊天窗口 */}
      <section className={cn('min-w-0 flex-1 flex-col bg-background', mobileView === 'chat' ? 'flex' : 'hidden sm:flex')}>
        {activeConv ? (
          <>
            {/* 头部 */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                onClick={() => setMobileView('list')}
                aria-label="返回会话列表"
              >
                <ArrowLeft />
              </Button>
              <Avatar className="size-9">
                {activeConv.otherUser.avatar && (
                  <AvatarImage src={activeConv.otherUser.avatar} alt={activeConv.otherUser.username} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(activeConv.otherUser.displayName || activeConv.otherUser.username)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <Link
                  href={`/u/${encodeURIComponent(activeConv.otherUser.username)}`}
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {activeConv.otherUser.displayName || activeConv.otherUser.username}
                </Link>
                <span className="text-xs text-muted-foreground">@{activeConv.otherUser.username}</span>
              </div>
            </div>

            {/* 消息区 */}
            <div ref={chatBodyRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-4">
              {messagesQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  加载中…
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">还没有消息，打个招呼吧</div>
              ) : (
                <>
                  {hasMore && (
                    <div className="flex justify-center">
                      <Button variant="outline" size="sm" onClick={loadEarlier}>
                        加载更早消息
                      </Button>
                    </div>
                  )}
                  {messages.map((m) => {
                    const isSelf = m.senderId === currentUser.id
                    return (
                      <div key={m.id} className={cn('flex', isSelf ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                            isSelf ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-card',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <div
                            className={cn(
                              'mt-1 flex items-center justify-end gap-1 text-[10px]',
                              isSelf ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}
                          >
                            <span>{formatEditedTime(m.createdAt)}</span>
                            {isSelf && <span>{m.readAt ? '已读' : '未读'}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* 输入区 */}
            <div className="border-t border-border bg-background p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                  rows={1}
                  className="max-h-32 min-h-[44px] flex-1 resize-none"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={handleSend}
                  disabled={sendMutation.isPending || !input.trim()}
                  aria-label="发送"
                >
                  {sendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageCircle className="mx-auto mb-3 size-10 opacity-40" />
              <p className="text-sm">选择一个会话开始聊天</p>
              <p className="mt-1 text-xs text-muted-foreground/70">未读 {unreadQuery.data?.count ?? 0} 条</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <CommunityShell>
      <Suspense>
        <MessagesInner />
      </Suspense>
    </CommunityShell>
  )
}
