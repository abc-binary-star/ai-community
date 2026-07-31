import type { Comment } from 'shared'
import { CommentItem } from './comment-item'

// 评论树：渲染根评论，每条自递归渲染 replies
export function CommentTree({
  comments,
  currentUserId,
  onReply,
  onDeleted,
}: {
  comments: Comment[]
  currentUserId?: string
  onReply: (c: Comment) => void
  onDeleted: () => void
}) {
  return (
    <div className="space-y-6">
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          currentUserId={currentUserId}
          onReply={onReply}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  )
}
