'use client'

import Link from 'next/link'
import { ArrowUp, CornerDownRight, Heart, MessageSquare, Sparkles, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2 } from 'lucide-react'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { useIdeaChainQuery } from '@/lib/use-idea-feed'
import type { IdeaChainNode } from 'shared'

/**
 * 想法链视图：一次只呈现一条纵向路径。
 *
 * 上方是它回应的想法，中间是它自己（高亮），下方是由它引出的想法与同段落的
 * 其他声音。这套交互和帖子详情页的滚动阅读是同一套肌肉记忆，不需要学习成本——
 * 而图谱视图需要用户理解节点、边和布局，代价高而收益低。用户可以沿任意一条
 * 路径继续走下去（点击任一节点进入它的链）。
 */
export function IdeaChainView({ id }: { id: string }) {
  const { data: chain, isLoading, isError } = useIdeaChainQuery(id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载想法链…
      </div>
    )
  }

  if (isError || !chain) {
    return null
  }

  const hasChain =
    !!chain.parent ||
    chain.children.length > 0 ||
    chain.siblings.length > 0 ||
    chain.neighbors.length > 0
  if (!hasChain) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        这条想法还没有连接到其他想法
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* 上游：它回应了谁 */}
      {chain.parent && (
        <section className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowUp className="size-3.5" />
            它回应了
          </p>
          <ChainNodeCard node={chain.parent} />
          <ChainConnector />
        </section>
      )}

      {/* 中间：当前想法（高亮为当前位置） */}
      <ChainNodeCard node={chain.current} current />

      {/* 下游：由它引出的想法 */}
      {chain.children.length > 0 && (
        <section className="space-y-1.5">
          <ChainConnector />
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CornerDownRight className="size-3.5" />
            由它引出 · {chain.children.length}
          </p>
          <div className="space-y-2">
            {chain.children.map((n) => (
              <ChainNodeCard key={n.id} node={n} />
            ))}
          </div>
        </section>
      )}

      {/* 同段落的其他声音 */}
      {chain.siblings.length > 0 && (
        <section className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="size-3.5" />
            同段落的其他声音 · {chain.siblings.length}
          </p>
          <div className="space-y-2">
            {chain.siblings.map((n) => (
              <ChainNodeCard key={n.id} node={n} muted />
            ))}
          </div>
        </section>
      )}

      {/* 语义相近的想法（近邻边，向量检索） */}
      {chain.neighbors.length > 0 && (
        <section className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            语义相近的想法 · {chain.neighbors.length}
          </p>
          <div className="space-y-2">
            {chain.neighbors.map((n) => (
              <ChainNodeCard key={n.id} node={n} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ChainConnector 纵向连接线，让「链」的方向感成立。
function ChainConnector() {
  return <div className="ml-4 h-4 w-px bg-border" aria-hidden />
}

function ChainNodeCard({
  node,
  current,
  muted,
}: {
  node: IdeaChainNode
  current?: boolean
  muted?: boolean
}) {
  const inner = (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        current
          ? 'border-primary/50 bg-primary/5'
          : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40',
        muted && 'bg-muted/20',
      )}
    >
      {node.excerpt && (
        <blockquote className="mb-2 line-clamp-2 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground sm:text-sm">
          {node.excerpt}
        </blockquote>
      )}
      <p className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground', current && 'font-medium')}>
        {node.body}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {node.author && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Avatar className="size-4">
              <AvatarImage src={node.author.avatar ?? undefined} alt={node.author.username} />
              <AvatarFallback className="text-[10px]">{getInitials(node.author.username)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{node.author.username}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="size-3" />
          {node.replyCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart className="size-3" />
          {node.likeCount}
        </span>
        {node.createdAt && <span>{formatRelativeTime(node.createdAt)}</span>}
        {current && <span className="ml-auto text-primary">当前</span>}
      </div>
    </div>
  )

  // 当前节点不可点击（已在此处）；其他节点点击进入它自己的链，实现「沿路径继续走」。
  if (current) return inner
  return (
    <Link href={`/community/idea/${node.id}`} className="block">
      {inner}
    </Link>
  )
}
