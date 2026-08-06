'use client'

import { useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { formatReadingMinutes, formatTileTarget, formatWords } from '../lib/rules'
import type { ReviewQueueItem } from '../lib/types'
import { ReviewBadge } from '../components/review-badge'

/**
 * 单条书目的审核卡片（PRD 9.3）。
 * 展示书目三要素、证据链接、AI 初审结论、成员历史通过率与队内重复提示，
 * 驳回与撤销必须填写理由。
 */
export function ReviewCard({
  item,
  busy,
  onReview,
}: {
  item: ReviewQueueItem
  busy: boolean
  onReview: (
    bookId: string,
    action: 'approve' | 'reject' | 'revoke',
    reason: string,
    countsForTask: boolean,
  ) => Promise<void>
}) {
  const { book, tile, memberPassRate, duplicateInTeam } = item
  const [reason, setReason] = useState('')
  // 默认计入任务进度；不符合格子条件时管理员可取消勾选，
  // 此时书目仍计入榜单但不推进任务（P0-4）
  const [countsForTask, setCountsForTask] = useState(true)
  const isApproved = book.reviewStatus === 'approved'

  return (
    <article className="rounded-lg border-2 border-stone-800 bg-white p-4 shadow-[4px_4px_0_#292524]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-stone-900">{book.title}</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {book.author} · {formatWords(book.wordCount)}
            {book.durationMinutes ? ` · ${formatReadingMinutes(book.durationMinutes)}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            {book.memberName}
            {book.teamName ? ` · ${book.teamName}` : ''} · 第 {book.tileIndex} 格第 {book.lap} 轮
          </p>
        </div>
        <ReviewBadge status={book.reviewStatus} />
      </div>

      <p className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-500">
        格子任务：{tile.title}（目标 {formatTileTarget(tile)}）
      </p>

      {book.genre && <p className="mt-1.5 text-[11px] text-stone-500">题材：{book.genre}</p>}
      {book.note && <p className="mt-1 text-[11px] text-stone-500">备注：{book.note}</p>}

      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {book.coverUrl && (
          <a
            href={book.coverUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
          >
            <ExternalLink aria-hidden className="size-3" />
            封面图
          </a>
        )}
        {book.evidenceUrl && (
          <a
            href={book.evidenceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
          >
            <ExternalLink aria-hidden className="size-3" />
            证据截图
          </a>
        )}
      </div>

      {book.aiReason && (
        <p className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-500">
          AI 初审：{book.aiReason}
          {book.aiConfidence ? `（置信度 ${(book.aiConfidence * 100).toFixed(0)}%）` : ''}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500">
        <span>该成员历史通过率 {(memberPassRate * 100).toFixed(0)}%</span>
        {duplicateInTeam && (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <AlertTriangle aria-hidden className="size-3" />
            队内已有相同书目
          </span>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-[11px] text-stone-700">
        <input
          type="checkbox"
          checked={countsForTask}
          onChange={(e) => setCountsForTask(e.target.checked)}
          className="size-3.5 rounded border-stone-300 bg-white"
        />
        计入当前格任务进度（不符合格子条件时取消勾选，仍计入榜单）
      </label>

      <input
        type="text"
        placeholder="驳回或撤销的理由（必填）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2 h-8 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs text-stone-900 placeholder:text-stone-500 focus:border-emerald-600 focus:outline-none"
      />

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!isApproved && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onReview(book.id, 'approve', '', countsForTask)}
            className="h-9 rounded-md border-2 border-stone-800 bg-[#78c6a3] text-xs font-black text-stone-900 shadow-[2px_2px_0_#292524] transition-colors hover:bg-[#65b891] disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
          >
            通过
          </button>
        )}
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() => void onReview(book.id, 'reject', reason, countsForTask)}
          className="h-9 rounded-md border-2 border-stone-800 bg-[#ff7b6b] text-xs font-black text-white shadow-[2px_2px_0_#292524] transition-colors hover:bg-[#e85d4f] disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
        >
          驳回
        </button>
        {isApproved && (
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => void onReview(book.id, 'revoke', reason, countsForTask)}
            className="h-9 rounded-md border-2 border-rose-400 text-xs font-black text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-500"
          >
            撤销（回滚进度）
          </button>
        )}
      </div>
    </article>
  )
}
