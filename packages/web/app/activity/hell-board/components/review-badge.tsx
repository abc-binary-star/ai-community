'use client'

import { cn } from '@/lib/utils'
import type { ReviewStatus } from '../lib/types'

/** 审核状态流文案（PRD 9.1）。AI 三条结论都进入人工队列，AI 不具终裁权。 */
const LABEL: Record<ReviewStatus, string> = {
  'pending-ai': '待初审',
  'ai-passed': 'AI 通过 · 待人工',
  'ai-unsure': 'AI 存疑 · 待人工',
  'ai-rejected': 'AI 驳回 · 待人工',
  approved: '已通过',
  rejected: '已驳回',
  revoked: '已撤销',
}

const TONE: Record<ReviewStatus, string> = {
  'pending-ai': 'bg-stone-200 text-stone-600',
  'ai-passed': 'bg-sky-100 text-sky-800',
  'ai-unsure': 'bg-amber-100 text-amber-800',
  'ai-rejected': 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  revoked: 'bg-rose-100 text-rose-800',
}

export function ReviewBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border border-current/20 px-2 py-0.5 text-[10px] font-medium',
        TONE[status],
        className,
      )}
    >
      {LABEL[status]}
    </span>
  )
}
