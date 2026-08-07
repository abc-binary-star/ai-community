'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, RefreshCcw, Scale, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { castVote, fetchVotePool } from '../lib/api'
import { formatReadingMinutes, formatWords } from '../lib/rules'
import { useIsCaptain } from '../lib/store'
import type { VotePoolItem } from '../lib/types'
import { ReviewBadge } from './review-badge'

/**
 * 队长投票池（审核池）：全员可见（只读），仅队长可投票。
 * 情况三封面格直接进入；情况一/二 AI 未过进入。赞成票过半（队长数的一半以上，
 * 10 队时即 >5 票）打卡通过，未过半的书留在池中等待更多队长投票。
 */
export function VotePoolPanel() {
  const isCaptain = useIsCaptain()
  const [items, setItems] = useState<VotePoolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await fetchVotePool())
    } catch (err) {
      setError(err instanceof Error ? err.message : '投票池加载失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleVote = async (bookId: string, vote: 'approve' | 'reject') => {
    if (busyId) return
    setBusyId(bookId)
    setNotice(null)
    setError(null)
    try {
      const updated = await castVote(bookId, vote)
      if (updated.resolved) {
        setNotice(`赞成过半，《${updated.book.title}》打卡通过并计入进度与榜单`)
        setItems((prev) => prev.filter((i) => i.book.id !== bookId))
      } else {
        setItems((prev) => prev.map((i) => (i.book.id === bookId ? updated : i)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '投票失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-white shadow-[4px_4px_0_#292524]">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b-2 border-stone-800 p-2.5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black text-stone-900">
            <Scale className="size-3.5 text-emerald-700" />
            队长投票池
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
            全员可见，仅队长可投。赞成过半即通过{isCaptain ? '，同一本书每人一票' : ''}。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="刷新投票池"
          className="rounded-md p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <RefreshCcw className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {notice && (
          <p className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-800">
            {notice}
          </p>
        )}
        {error && (
          <p className="mb-2 rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-800">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-stone-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-6 text-stone-300" />
            <p className="text-xs text-stone-500">审核池暂无待投票书目</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const { book, tile } = item
              // 队长数为 0 时避免除零得到 NaN 宽度
              const captainBase = item.totalCaptains > 0 ? item.totalCaptains : 1
              const need = Math.floor(item.totalCaptains / 2) + 1
              const totalVoted = item.yesCount + item.noCount
              return (
                <li key={book.id} className="rounded-md border border-stone-300 bg-[#fffdf5] p-2.5">
                  <div className="flex items-start gap-2">
                    {/* 封面图：封面颜色格靠它核验颜色，直出缩略图便于队长判断 */}
                    {book.coverUrl && (
                      <img
                        src={book.coverUrl}
                        alt={`《${book.title}》封面`}
                        className="h-16 w-12 shrink-0 rounded border border-stone-200 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-bold text-stone-900">{book.title}</p>
                        <ReviewBadge status={book.reviewStatus} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {book.author} · {formatWords(book.wordCount)}
                        {book.durationMinutes
                          ? ` · ${formatReadingMinutes(book.durationMinutes)}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 rounded bg-stone-50 px-1.5 py-1 text-[10px] leading-relaxed text-stone-500">
                    {book.memberName} · 第 {book.tileIndex} 格「{tile.title}」
                  </p>

                  {/* 票数进度：赞成绿 / 反对红，过半线 = 队长数一半 + 1 */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] font-medium text-stone-500">
                      <span>
                        赞成 {item.yesCount} / 需 {need} 票通过
                      </span>
                      <span>
                        队长 {item.totalCaptains} · 已投 {totalVoted}
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full border border-stone-200 bg-stone-100">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(item.yesCount / captainBase) * 100}%` }}
                      />
                      <div
                        className="h-full bg-rose-400 transition-all"
                        style={{ width: `${(item.noCount / captainBase) * 100}%` }}
                      />
                    </div>
                  </div>

                  {isCaptain ? (
                    item.myVote ? (
                      <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <Check className="size-3" />
                        已投{item.myVote === 'approve' ? '赞成' : '反对'}
                        <button
                          type="button"
                          disabled={busyId === book.id}
                          onClick={() =>
                            void handleVote(book.id, item.myVote === 'approve' ? 'reject' : 'approve')
                          }
                          className="ml-auto rounded border border-stone-300 px-1.5 py-0.5 text-[10px] text-stone-500 hover:border-stone-800 hover:text-stone-900 disabled:opacity-50"
                        >
                          改票
                        </button>
                      </p>
                    ) : (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === book.id}
                          onClick={() => void handleVote(book.id, 'approve')}
                          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border-2 border-stone-800 bg-emerald-50 text-[11px] font-bold text-emerald-800 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                        >
                          <ThumbsUp className="size-3" />
                          赞成
                        </button>
                        <button
                          type="button"
                          disabled={busyId === book.id}
                          onClick={() => void handleVote(book.id, 'reject')}
                          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border-2 border-stone-800 bg-rose-50 text-[11px] font-bold text-rose-700 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                        >
                          <ThumbsDown className="size-3" />
                          反对
                        </button>
                      </div>
                    )
                  ) : (
                    <p className="mt-2 text-[10px] text-stone-400">仅队长可投票</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
