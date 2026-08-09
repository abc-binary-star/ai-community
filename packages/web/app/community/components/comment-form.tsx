'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Mic, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { hasMdImage, normalizeMdImages } from '@/lib/markdown-images'
import type { Comment } from 'shared'
import { VoiceComposer } from './voice-composer'

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
  const [voiceOpen, setVoiceOpen] = useState(false)

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
        <div className="flex items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-accent-foreground">回复 @{replyTo.author.username}</span>
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
        onChange={(e) => {
          const next = e.target.value
          // 兜底把 B站/贴吧复制的图片语法转成标准 ![图片](url)
          setContent(hasMdImage(next) ? normalizeMdImages(next) : next)
        }}
        placeholder={replyTo ? `回复 @${replyTo.author.username}…` : '写下你的评论…'}
        className="min-h-[100px] resize-y"
      />
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setVoiceOpen(true)}
          title="语音输入"
        >
          <Mic className="size-4" />
          语音
        </Button>
        <Button onClick={submit} disabled={submitting || !content.trim()}>
          {submitting && <Loader2 className="animate-spin" />}
          {replyTo ? '回复' : '评论'}
        </Button>
      </div>
      {voiceOpen && (
        <VoiceComposer
          target="comment"
          onInsert={(text) => setContent((prev) => (prev ? prev + '\n' + text : text))}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  )
}
