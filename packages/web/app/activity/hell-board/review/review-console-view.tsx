'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { batchApprove, fetchReviewQueue, reviewBook } from '../lib/api'
import type { ReviewQueueItem, ReviewStatus } from '../lib/types'
import { ReviewCard } from './review-card'

/** 队列筛选项，对应 PRD 9.1 的审核状态流 */
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部待处理' },
  { key: 'ai-rejected', label: 'AI 驳回' },
  { key: 'ai-unsure', label: 'AI 存疑' },
  { key: 'ai-passed', label: 'AI 通过' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]

/**
 * 人工终审台（PRD 9.3）：按小组、格子、状态筛选，逐条通过或驳回，
 * 支持批量确认 AI 通过项。AI 不具终裁权，三条 AI 结论都必须人工过一遍。
 */
export function ReviewConsoleView() {
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [status, setStatus] = useState('')
  const [tileIndex, setTileIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchReviewQueue({ status, tileIndex: tileIndex || undefined })
      setItems(res.items ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '审核队列加载失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [status, tileIndex])

  useEffect(() => {
    void load()
  }, [load])

  const handleReview = async (
    bookId: string,
    action: 'approve' | 'reject' | 'revoke',
    reason: string,
    countsForTask: boolean,
  ) => {
    setBusyId(bookId)
    setError(null)
    try {
      await reviewBook(bookId, { action, reason, countsForTask })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  // 批量确认仅对 AI 通过项开放，存疑与驳回必须逐条看证据
  const aiPassedIds = items
    .filter((i) => i.book.reviewStatus === ('ai-passed' as ReviewStatus))
    .map((i) => i.book.id)

  const handleBatch = async () => {
    if (aiPassedIds.length === 0) return
    setError(null)
    try {
      await batchApprove(aiPassedIds)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量确认失败')
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f6ed] [background-image:radial-gradient(#d6d3c5_0.8px,transparent_0.8px)] [background-size:18px_18px] px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/activity/hell-board"
          className="inline-flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-stone-800"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          返回活动页
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-stone-900">人工终审台</h1>
            <p className="mt-1 text-xs text-stone-500">
              共 {total} 条待处理。任务进度仅由终审通过的打卡累加，AI 结论不直接改变进度。
            </p>
          </div>
          {aiPassedIds.length > 0 && (
            <button
              type="button"
              onClick={() => void handleBatch()}
              className="flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#78c6a3] px-3 text-xs font-black text-stone-900 shadow-[3px_3px_0_#292524] transition-colors hover:bg-[#65b891]"
            >
              <CheckCheck aria-hidden className="size-3.5" />
              批量确认 AI 通过项（{aiPassedIds.length}）
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
              className={cn(
                'rounded-md border-2 border-stone-800 px-2.5 py-1.5 text-[11px] transition-colors',
                status === f.key
                  ? 'bg-[#ffd166] text-stone-900'
                  : 'bg-white text-stone-500 hover:bg-stone-100 hover:text-stone-800',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 text-[11px] text-stone-500">
          按格子筛选
          <select
            value={tileIndex}
            onChange={(e) => setTileIndex(Number(e.target.value))}
            className="h-8 rounded-lg border-2 border-stone-300 bg-white px-2 text-xs text-stone-800 focus:border-emerald-600 focus:outline-none"
          >
            <option value={0}>全部格子</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                第 {n} 格
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
          >
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-10 flex justify-center">
            <Loader2 aria-label="加载中" className="size-6 animate-spin text-stone-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="mt-10 rounded-lg border-2 border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">当前筛选条件下没有待处理记录。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.book.id}>
                <ReviewCard
                  item={item}
                  busy={busyId === item.book.id}
                  onReview={handleReview}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
