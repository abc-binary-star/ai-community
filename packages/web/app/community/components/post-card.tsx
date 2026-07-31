import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { formatRelativeTime, truncate } from '@/lib/utils'
import { CHANNEL_LABELS, type Post } from 'shared'

// 报纸式条目：左列元信息（作者/时间），右列标题+预览+评论数
// 细横线分隔，hover 只改标题颜色，无位移无阴影
export function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/community/post/${post.id}`} className="block border-t border-border py-5 first:border-t-0 group">
      <div className="flex gap-6">
        {/* 左列：元信息 */}
        <div className="hidden w-28 shrink-0 flex-col gap-1 sm:flex">
          <span className="font-sans text-sm font-medium text-foreground">{post.author.username}</span>
          <span className="font-serif text-xs italic text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
        </div>
        {/* 右列：内容 */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3">
            {/* 移动端显示作者，桌面隐藏（已在左列） */}
            <span className="font-sans text-sm font-medium text-foreground sm:hidden">{post.author.username}</span>
            <span className="font-serif text-xs italic text-muted-foreground sm:hidden">
              · {formatRelativeTime(post.createdAt)}
            </span>
            <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-primary/80">
              {CHANNEL_LABELS[post.channel] || post.channel}
            </span>
          </div>
          <h3 className="font-display text-xl leading-snug text-foreground transition-colors group-hover:text-primary">
            {post.title}
          </h3>
          <p className="line-clamp-2 font-serif text-[15px] leading-7 text-muted-foreground">{truncate(post.content, 160)}</p>
          <div className="flex items-center gap-1.5 pt-1 font-sans text-xs text-muted-foreground">
            <MessageCircle className="size-3.5" />
            {post.commentCount} 条评论
          </div>
        </div>
      </div>
    </Link>
  )
}
