'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchFeedback, resolveFeedback } from '../lib/api'
import type { FeedbackItem } from '../lib/types'

const TYPE_LABEL: Record<FeedbackItem['type'], string> = {
  bug: 'Bug',
  feature: '需求',
  other: '其他',
}

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'pending', label: '待处理' },
  { key: 'resolved', label: '已处理' },
]

/**
 * 用户反馈台（审批台）：用户从「我的」页面提交 bug / 需求，
 * 管理员在这里查看并标记已处理（可附回复）。
 */
export function FeedbackConsolePanel() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFeedback(status === 'pending' ? 'pending' : 'resolved')
      setItems(res.items ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '反馈列表加载失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  const handleResolve = async (fb: FeedbackItem) => {
    if (busyId) return
    setBusyId(fb.id)
    setError(null)
    try {
      await resolveFeedback(fb.id, '')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
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
        <span className="ml-auto text-[11px] text-stone-400">共 {total} 条</span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 aria-label="加载中" className="size-6 animate-spin text-stone-500" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          {status === 'pending' ? '暂无待处理的反馈' : '暂无已处理的反馈'}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((fb) => (
            <li
              key={fb.id}
              className="rounded-lg border-2 border-stone-800 bg-white p-4 shadow-[4px_4px_0_#292524]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-black',
                        fb.type === 'bug'
                          ? 'bg-rose-100 text-rose-700'
                          : fb.type === 'feature'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-stone-100 text-stone-600',
                      )}
                    >
                      {TYPE_LABEL[fb.type]}
                    </span>
                    <span className="font-bold text-stone-900">{fb.userName}</span>
                    <span className="text-stone-400">
                      {new Date(fb.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">
                    {fb.content}
                  </p>
                  {fb.contact && (
                    <p className="mt-1.5 text-[11px] text-stone-500">联系方式：{fb.contact}</p>
                  )}
                  {fb.reply && (
                    <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                      处理回复：{fb.reply}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black',
                    fb.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {fb.status === 'resolved' ? '已处理' : '待处理'}
                </span>
              </div>

              {fb.status === 'pending' && (
                <button
                  type="button"
                  disabled={busyId === fb.id}
                  onClick={() => void handleResolve(fb)}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#78c6a3] px-3 text-xs font-black text-stone-900 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                >
                  {busyId === fb.id ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCheck aria-hidden className="size-3.5" />
                  )}
                  标记已处理
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
