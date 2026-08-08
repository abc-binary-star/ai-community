'use client'

import { useState } from 'react'
import { Loader2, Lock, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { useCreateAnnotation, type CreateAnnotationInput } from '@/lib/use-annotations'

const BODY_LIMIT = 1000

export interface AnnotationDraft {
  scope: 'selection' | 'paragraph' | 'whole'
  anchor: string
  startOffset: number
  endOffset: number
  selectedText: string
  prefix?: string
  suffix?: string
  paragraphSnapshot?: string
  /** 引用边：本条想法回应的另一条想法 */
  parentAnnotationId?: string
  /** 被回应想法的正文预览，仅用于编辑器提示，不提交 */
  parentPreview?: string
}

interface Props {
  postId: string
  draft: AnnotationDraft
  onClose: () => void
}

// 想法编辑器：引用预览 + 正文 + 可见范围 + 发布。
// 默认公开（对齐 PRD 6.2：默认公开，发布按钮旁持续展示当前范围）。
export function AnnotationEditor({ postId, draft, onClose }: Props) {
  const create = useCreateAnnotation(postId)
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  const isWhole = draft.scope === 'whole'
  const quote = isWhole
    ? ''
    : draft.scope === 'paragraph'
      ? draft.paragraphSnapshot || draft.selectedText
      : draft.selectedText

  const canSubmit = body.trim().length >= 1 && body.length <= BODY_LIMIT && !create.isPending

  const handlePublish = async () => {
    if (!canSubmit) return
    const input: CreateAnnotationInput = {
      scope: draft.scope,
      anchor: draft.anchor,
      startOffset: draft.startOffset,
      endOffset: draft.endOffset,
      selectedText: draft.selectedText,
      prefix: draft.prefix,
      suffix: draft.suffix,
      paragraphSnapshot: draft.paragraphSnapshot,
      body: body.trim(),
      visibility,
      parentAnnotationId: draft.parentAnnotationId,
    }
    try {
      await create.mutateAsync(input)
      toast.success(visibility === 'private' ? '已记录到仅自己可见' : '想法已发布')
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '发布失败')
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      {draft.parentAnnotationId && draft.parentPreview && (
        <p className="line-clamp-2 rounded-md bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground">
          回应：{draft.parentPreview}
        </p>
      )}
      {quote && (
        <blockquote className="line-clamp-2 border-l-2 border-primary/40 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          {quote}
        </blockquote>
      )}
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, BODY_LIMIT))}
        placeholder={isWhole ? '对整篇文章说点什么…' : '写下你的想法…'}
        className="min-h-[72px] resize-none text-sm"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              visibility === 'public'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Globe className="size-3.5" />
            公开
          </button>
          <button
            type="button"
            onClick={() => setVisibility('private')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              visibility === 'private'
                ? 'bg-amber-500/10 text-amber-600'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Lock className="size-3.5" />
            仅自己可见
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {body.length}/{BODY_LIMIT}
          </span>
          <Button variant="ghost" size="sm" className="h-7" onClick={onClose} disabled={create.isPending}>
            取消
          </Button>
          <Button size="sm" className="h-7" onClick={handlePublish} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            发布
          </Button>
        </div>
      </div>
    </div>
  )
}
