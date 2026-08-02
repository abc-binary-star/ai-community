'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { formatEditedTime, formatRelativeTime, getInitials } from '@/lib/utils'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import type { Comment, Paginated } from 'shared'
import { LikeButton } from './like-button'
import { MarkdownEditor } from '@/components/markdown-editor'
import { ReportButton } from './report-button'

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
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [submitting, setSubmitting] = useState(false)

  // 回复折叠/展开状态
  const [replies, setReplies] = useState<Comment[]>(comment.replies)
  const [replyCount, setReplyCount] = useState(comment.replyCount)
  const [expanded, setExpanded] = useState(false)
  const [loadingReplies, setLoadingReplies] = useState(false)

  // 剩余未展示的回复数
  const hiddenCount = replyCount - replies.length

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

  const handleSaveEdit = async () => {
    const text = editContent.trim()
    if (!text) return
    setSubmitting(true)
    try {
      await api.put(`/comments/${comment.id}`, { content: text })
      toast.success('已更新')
      setEditing(false)
      onDeleted()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = () => {
    setEditContent(comment.content)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditContent(comment.content)
  }

  // 展开回复：加载下一页回复
  const handleLoadMoreReplies = async () => {
    if (loadingReplies) return
    setLoadingReplies(true)
    try {
      const res = await api.get<Paginated<Comment>>(
        `/comments/${comment.id}/replies?page=1&pageSize=${replyCount}`
      )
      setReplies(res.items)
      setExpanded(true)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '加载回复失败')
    } finally {
      setLoadingReplies(false)
    }
  }

  // 收起回复：恢复到只展示前3条
  const handleCollapse = () => {
    setReplies(comment.replies)
    setExpanded(false)
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
            {comment.edited && <span className="text-xs text-muted-foreground">· 已编辑于 {formatEditedTime(comment.updatedAt)}</span>}
            {depth > 0 && <span className="text-xs text-muted-foreground">· 回复</span>}
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <MarkdownEditor
                value={editContent}
                onChange={setEditContent}
                height={150}
                placeholder="编辑评论内容…"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={submitting}>
                  <X className="size-3.5" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={submitting || !editContent.trim()}>
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-2 break-words text-sm leading-6 text-foreground/90">
                <MarkdownRenderer content={comment.content} />
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onReply(comment)}>
                  <MessageSquare className="size-3.5" />
                  回复
                </Button>
                <LikeButton target="comment" id={comment.id} likeCount={comment.likeCount} liked={comment.liked} />
                {!isAuthor && <ReportButton targetType="comment" targetId={comment.id} />}
                {isAuthor && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={startEdit}
                    >
                      <Pencil className="size-3.5" />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={handleDelete}
                    >
                      <Trash2 className="size-3.5" />
                      删除
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* 回复折叠/展开按钮 */}
      {hiddenCount > 0 && !expanded && (
        <div className="ml-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-primary hover:text-primary"
            onClick={handleLoadMoreReplies}
            disabled={loadingReplies}
          >
            {loadingReplies ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            展开 {hiddenCount} 条回复
          </Button>
        </div>
      )}

      {/* 回复列表 */}
      {replies.length > 0 && (
        <div className="space-y-2">
          {replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              depth={depth + 1}
              currentUserId={currentUserId}
              onReply={onReply}
              onDeleted={onDeleted}
            />
          ))}
          {expanded && hiddenCount === 0 && replyCount > 3 && (
            <div className="ml-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleCollapse}
              >
                <ChevronUp className="size-3.5" />
                收起回复
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
