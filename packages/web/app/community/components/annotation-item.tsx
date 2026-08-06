'use client'

import { useState } from 'react'
import { Heart, Loader2, MessageSquare, Pencil, Trash2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import type { Annotation, AnnotationReply } from 'shared'
import {
  useCreateAnnotationReply,
  useDeleteAnnotation,
  useDeleteAnnotationReply,
  useUpdateAnnotationReply,
  useToggleAnnotationLike,
  useUpdateAnnotation,
  fetchAnnotationReplies,
} from '@/lib/use-annotations'
import { ReportButton } from './report-button'

const REPLY_LIMIT = 500

function AuthorName({ name }: { name: string }) {
  return <span className="font-medium text-foreground">{name}</span>
}

function ReplyRow({
  postId,
  reply,
  currentUserId,
}: {
  postId: string
  reply: AnnotationReply
  currentUserId?: string
}) {
  const del = useDeleteAnnotationReply(postId)
  const update = useUpdateAnnotationReply(postId)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(reply.body)
  const isAuthor = !!currentUserId && currentUserId === reply.authorId

  if (reply.folded) {
    return (
      <div className="py-1 text-xs italic text-muted-foreground">该回复已折叠</div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Avatar className="size-5">
          <AvatarImage src={reply.author.avatar ?? undefined} />
          <AvatarFallback className="text-[10px]">{getInitials(reply.author.displayName || reply.author.username)}</AvatarFallback>
        </Avatar>
        <AuthorName name={reply.author.displayName || reply.author.username} />
        {reply.replyToUserId && <span className="text-xs text-muted-foreground">回复</span>}
        <span className="text-[11px] text-muted-foreground">{formatRelativeTime(reply.createdAt)}</span>
        {reply.edited && <span className="text-[11px] text-muted-foreground">已编辑</span>}
      </div>
      {reply.status === 'deleted' || reply.status === 'moderated' ? (
        <p className="text-xs italic text-muted-foreground">
          {reply.status === 'moderated' ? '该回复已被处理' : '该回复已删除'}
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{reply.body}</p>
      )}
      {isAuthor && reply.status === 'active' && !editing && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            <Pencil className="size-3" /> 编辑
          </button>
          <button
            onClick={async () => {
              try {
                await del.mutateAsync(reply.id)
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : '删除失败')
              }
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-destructive hover:bg-muted"
          >
            <Trash2 className="size-3" /> 删除
          </button>
        </div>
      )}
      {editing && (
        <ReplyEditor
          initial={editText}
          onTextChange={setEditText}
          onCancel={() => setEditing(false)}
          submitting={update.isPending}
          onSubmit={async () => {
            if (!editText.trim()) return
            try {
              await update.mutateAsync({ replyId: reply.id, body: editText.trim() })
              setEditing(false)
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : '编辑失败')
            }
          }}
        />
      )}
      <ReportButton targetType="annotation_reply" targetId={reply.id} />
    </div>
  )
}

function ReplyEditor({
  initial,
  onTextChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: string
  onTextChange?: (text: string) => void
  onSubmit: (body: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [text, setText] = useState(initial)
  return (
    <div className="space-y-1">
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => {
          const v = e.target.value.slice(0, REPLY_LIMIT)
          setText(v)
          onTextChange?.(v)
        }}
        className="min-h-[56px] resize-none text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button size="sm" className="h-7" onClick={() => text.trim() && onSubmit(text.trim())} disabled={!text.trim() || submitting}>
          {submitting && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          发送
        </Button>
      </div>
    </div>
  )
}

export function AnnotationItem({
  postId,
  annotation,
  currentUserId,
}: {
  postId: string
  annotation: Annotation
  currentUserId?: string
}) {
  const del = useDeleteAnnotation(postId)
  const update = useUpdateAnnotation(postId)
  const like = useToggleAnnotationLike(postId)
  const createReply = useCreateAnnotationReply(postId)

  const [replies, setReplies] = useState<AnnotationReply[]>(annotation.replies)
  const [replyCount, setReplyCount] = useState(annotation.replyCount)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(annotation.body)
  const [likeState, setLikeState] = useState({ liked: annotation.liked, count: annotation.likeCount })

  const isAuthor = !!currentUserId && currentUserId === annotation.authorId
  const hiddenReplies = replyCount - replies.length
  const name = annotation.author.displayName || annotation.author.username

  const handleLike = async () => {
    const prev = likeState
    const next = { liked: !prev.liked, count: prev.liked ? prev.count - 1 : prev.count + 1 }
    setLikeState(next)
    try {
      const res = await like.mutateAsync({ annotationId: annotation.id, liked: prev.liked })
      setLikeState({ liked: res.liked, count: res.likeCount })
    } catch (e) {
      setLikeState(prev)
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  const handleLoadReplies = async () => {
    setLoadingReplies(true)
    try {
      const items = await fetchAnnotationReplies(postId, annotation.id, replyCount)
      setReplies(items)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '加载回复失败')
    } finally {
      setLoadingReplies(false)
    }
  }

  const handleSendReply = async (body: string) => {
    try {
      const r = await createReply.mutateAsync({ annotationId: annotation.id, body })
      setReplies((prev) => [...prev, r])
      setReplyCount((c) => c + 1)
      setShowReplyInput(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '回复失败')
    }
  }

  const handleSaveEdit = async () => {
    if (!editBody.trim()) return
    try {
      await update.mutateAsync({ id: annotation.id, body: editBody.trim() })
      setEditing(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '编辑失败')
    }
  }

  const handleDelete = async () => {
    try {
      await del.mutateAsync(annotation.id)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  if (annotation.folded) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
        该作者的想法已折叠
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Avatar className="size-6">
          <AvatarImage src={annotation.author.avatar ?? undefined} />
          <AvatarFallback className="text-[11px]">{getInitials(name)}</AvatarFallback>
        </Avatar>
        <AuthorName name={name} />
        {annotation.visibility === 'private' && (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600">
            <Lock className="size-2.5" /> 仅自己可见
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">{formatRelativeTime(annotation.createdAt)}</span>
        {annotation.edited && <span className="text-[11px] text-muted-foreground">已编辑</span>}
        {annotation.anchorStatus === 'orphaned' && (
          <span className="text-[11px] text-amber-600">原文已变更</span>
        )}
      </div>

      {annotation.status === 'deleted' || annotation.status === 'moderated' ? (
        <p className="text-sm italic text-muted-foreground">
          {annotation.status === 'moderated' ? '该想法已被处理' : '该想法已删除'}
        </p>
      ) : editing ? (
        <div className="space-y-1">
          <Textarea
            autoFocus
            value={editBody}
            onChange={(e) => setEditBody(e.target.value.slice(0, 1000))}
            className="min-h-[60px] resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7" onClick={() => { setEditing(false); setEditBody(annotation.body) }} disabled={update.isPending}>
              取消
            </Button>
            <Button size="sm" className="h-7" onClick={handleSaveEdit} disabled={!editBody.trim() || update.isPending}>
              {update.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              保存
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{annotation.body}</p>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={handleLike}
          disabled={like.isPending}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
            likeState.liked ? 'text-rose-500 hover:bg-rose-50' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          <Heart className={cn('size-3.5', likeState.liked && 'fill-current')} />
          {likeState.count}
        </button>
        <button
          onClick={() => setShowReplyInput((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <MessageSquare className="size-3.5" />
          {replyCount}
        </button>
        {isAuthor && annotation.status === 'active' && !editing && (
          <>
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
              <Pencil className="size-3.5" /> 编辑
            </button>
            <button onClick={handleDelete} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-muted">
              <Trash2 className="size-3.5" /> 删除
            </button>
          </>
        )}
        {annotation.status === 'active' && <ReportButton targetType="annotation" targetId={annotation.id} />}
      </div>

      {showReplyInput && (
        <ReplyEditor initial="" onSubmit={handleSendReply} onCancel={() => setShowReplyInput(false)} submitting={createReply.isPending} />
      )}

      {replies.length > 0 && (
        <div className="space-y-2 border-l-2 border-border pl-3">
          {replies.map((r) => (
            <ReplyRow key={r.id} postId={postId} reply={r} currentUserId={currentUserId} />
          ))}
          {hiddenReplies > 0 && (
            <button
              onClick={handleLoadReplies}
              disabled={loadingReplies}
              className="text-xs text-primary hover:underline"
            >
              {loadingReplies ? '加载中…' : `展开剩余 ${hiddenReplies} 条回复`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
