'use client'

import { MessageSquare, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import type { Comment } from 'shared'

// 单条评论：去边框盒，左侧细竖线 + 缩进表示嵌套（Reddit 清爽版）
export function CommentItem({
  comment,
  currentUserId,
  onReply,
  onDeleted,
}: {
  comment: Comment
  currentUserId?: string
  onReply: (c: Comment) => void
  onDeleted: () => void
}) {
  const isAuthor = !!currentUserId && currentUserId === comment.author.id

  const handleDelete = async () => {
    if (!window.confirm('确定删除这条评论吗？')) return
    try {
      await api.del(`/comments/${comment.id}`)
      toast.success('已删除')
      onDeleted()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-sans text-sm font-medium text-foreground">{comment.author.username}</span>
          <span className="font-serif text-xs italic text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words font-serif text-[15px] leading-7 text-foreground/90">
          {comment.content}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <Button variant="link" size="sm" className="h-6 px-0 text-xs text-muted-foreground" onClick={() => onReply(comment)}>
            <MessageSquare className="size-3" />
            回复
          </Button>
          {isAuthor && (
            <Button
              variant="link"
              size="sm"
              className="h-6 px-0 text-xs text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="size-3" />
              删除
            </Button>
          )}
        </div>
      </div>

      {/* 嵌套回复：左竖线 + 缩进 */}
      {comment.replies.length > 0 && (
        <div className="ml-4 space-y-4 border-l border-border pl-4">
          {comment.replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              currentUserId={currentUserId}
              onReply={onReply}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
