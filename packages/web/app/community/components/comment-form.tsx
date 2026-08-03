'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import type { Comment } from 'shared'

export function CommentForm({
  postId,
  replyTo,
  onDone,
  onCancelReply,
}: {
  postId: string
  replyTo: Comment | null
  onDone: () => void
  onCancelReply: () => void
}) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const text = content.trim()
    if (!text) return
    setSubmitting(true)
    try {
      await api.post(`/posts/${postId}/comments`, { content: text, parentId: replyTo?.id })
      setContent('')
      toast.success(replyTo ? '回复成功' : '评论成功')
      onDone()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      {replyTo && (
        <div className="flex items-center justify-between rounded-lg bg-accent px-3 py-2 text-sm">
          <span className="text-accent-foreground">回复 @{replyTo.author.username}</span>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-muted-foreground hover:text-foreground"
            aria-label="取消回复"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={replyTo ? `回复 @${replyTo.author.username}…` : '写下你的评论…'}
        className="min-h-[100px] resize-y"
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting || !content.trim()}>
          {submitting && <Loader2 className="animate-spin" />}
          {replyTo ? '回复' : '评论'}
        </Button>
      </div>
    </div>
  )
}
