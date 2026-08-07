'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { fetchReviewQueue, reviewBook } from '../lib/api'
import type { ReviewQueueItem } from '../lib/types'
import { ReviewCard } from './review-card'

/** 队列筛选项：默认看已通过（监督视角），也可回看投票池与被驳回的 */
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: '已打卡成功' },
  { key: 'in-voting', label: '队长投票中' },
  { key: 'rejected', label: '已驳回' },
  { key: 'revoked', label: '已撤销' },
]

/**
 * 监督台（原人工终审台）。
 *
 * 审核权已完全交给队长投票：AI 初审通过直接生效，未过则进投票池由队长过半通过，
 * 管理员不再决定「能不能通过」。这里默认只列已打卡成功的书目，用于事后监督——
 * 发现刷量或不符合任务要求时驳回 / 撤销，撤销会同步回滚格子进度。
 */
export function ReviewConsoleView() {
  const role = useAuthStore((s) => s.user?.role)
  const canReview = role === 'admin' || role === 'moderator'
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
    // 无权限时连队列请求都不发，只渲染无权限页
    if (!canReview) return
    void load()
  }, [load, canReview])

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

  // 前端角色拦截：非 admin / moderator 直接显示无权限页，不发无效请求。
  // 权限真正的兜底仍是接口层 403（如账号角色过期）。
  if (!canReview) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6ed] px-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border-2 border-stone-800 bg-white p-6 text-center shadow-[5px_5px_0_#292524]">
          <ShieldAlert aria-hidden className="size-8 text-rose-500" />
          <h1 className="text-base font-black text-stone-900">没有终审权限</h1>
          <p className="text-xs leading-relaxed text-stone-500">
            人工终审台仅对管理员和版主开放。如果认为这是误判，请确认账号角色后再试。
          </p>
          <Link
            href="/activity/hell-board"
            className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            返回活动页
          </Link>
        </div>
      </main>
    )
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

        <div className="mt-3">
          <h1 className="text-2xl font-black text-stone-900">打卡监督台</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            共 {total} 条。审核由队长投票决定，这里只做事后监督：发现刷量或不符合任务要求时驳回，
            撤销会同步回滚该格进度。
          </p>
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
