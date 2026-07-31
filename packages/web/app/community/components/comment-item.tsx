'use client'

import { MessageSquare, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { formatRelativeTime, getInitials } from '@/lib/utils'
import type { Comment } from 'shared'
import { LikeButton } from './like-button'

// 清爽评论卡片：浅蓝左边框，嵌套缩进
export function CommentItem({
  comment,
  depth,
  currentUserId,
  onReply,
  onDeleted,
}: {
  comment: Comment
  depth: number
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
    <div className="space-y-2">
      <Card
        className={`border-l-2 ${depth > 0 ? 'border-l-primary/40' : 'border-l-primary'}`}
        style={{ marginLeft: depth > 0 ? Math.min(depth, 5) * 16 : 0 }}
      >
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(comment.author.username)}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{comment.author.username}</span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
            {depth > 0 && <span className="text-xs text-muted-foreground">· 回复</span>}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{comment.content}</p>
          <div className="mt-2 flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onReply(comment)}>
              <MessageSquare className="size-3.5" />
              回复
            </Button>
            <LikeButton target="comment" id={comment.id} likeCount={comment.likeCount} liked={comment.liked} />
            {isAuthor && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="size-3.5" />
                删除
              </Button>
            )}
          </div>
        </div>
      </Card>

      {comment.replies.length > 0 && (
        <div className="space-y-2">
          {comment.replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              depth={depth + 1}
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
