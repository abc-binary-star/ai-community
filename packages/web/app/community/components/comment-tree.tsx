import type { Comment } from 'shared'
import { CommentItem } from './comment-item'

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
    <div className="space-y-3">
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          depth={0}
          currentUserId={currentUserId}
          onReply={onReply}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  )
}
