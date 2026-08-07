'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookX, Loader2, Pencil, RefreshCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchCheckIns, fetchMyBooks } from '../lib/api'
import { formatReadingMinutes, formatWords } from '../lib/rules'
import { useActivityStore, useCurrentTeam } from '../lib/store'
import type { CheckIn, CheckInDraftBook, ServerBook } from '../lib/types'
import { CheckInFormDialog } from './checkin-form-dialog'
import { ReviewBadge } from './review-badge'

type MineTab = 'pending' | 'approved' | 'rejected'

const TABS: Array<{ key: MineTab; label: string }> = [
  { key: 'pending', label: '未审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]

/**
 * 我的打卡（侧边栏标签页）：三栏查看本人书目审核状态。
 * 已驳回的书可在队伍当前格修改后重新提交（服务端校验当前格），
 * 提交后原驳回记录被替换。
 */
export function MyCheckInsPanel() {
  const [tab, setTab] = useState<MineTab>('pending')
  const [items, setItems] = useState<ServerBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resubmitBook, setResubmitBook] = useState<ServerBook | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  // 编辑历史打卡：一次打卡含多本书，预填整次打卡书目
  const [editCheckIn, setEditCheckIn] = useState<CheckIn | null>(null)

  const team = useCurrentTeam()
  const archived = useActivityStore((s) => s.archived)
  // 走 store action 而非直接调 api：deleteCheckIn 内部会 refresh() 重拉棋盘快照，
  // 撤回后任务进度 / 保底 / 队伍状态立即同步，不用等 10 秒轮询
  const storeDeleteCheckIn = useActivityStore((s) => s.deleteCheckIn)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await fetchMyBooks(tab))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  // 重新提交仅当队伍在场且活动未归档时可用（提交位置 = 队伍当前格）
  const canResubmit = Boolean(team) && !archived

  // 撤回未进入终审的打卡（PRD 8.4）：一次撤回整次提交
  const handleWithdraw = async (book: ServerBook) => {
    if (withdrawing) return
    if (!book.checkInId) return
    setWithdrawing(book.checkInId)
    try {
      await storeDeleteCheckIn(book.checkInId)
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤回失败')
    } finally {
      setWithdrawing(null)
    }
  }

  // 编辑历史打卡：从本队打卡列表取整次打卡（含全部书目与心得），预填表单
  const handleEdit = async (book: ServerBook) => {
    if (!book.checkInId) return
    try {
      const checkIns = await fetchCheckIns()
      const target = checkIns.find((c) => c.id === book.checkInId)
      if (!target) {
        setError('未找到该打卡记录')
        return
      }
      setEditCheckIn(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载打卡记录失败')
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-white shadow-[4px_4px_0_#292524]">
      <div className="flex shrink-0 gap-1 border-b-2 border-stone-800 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-8 flex-1 rounded-md text-xs font-bold transition-colors',
              tab === t.key
                ? 'bg-[#ffd166] text-stone-900'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
            <p className="text-xs text-stone-500">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
            >
              <RefreshCcw className="size-3" />
              重试
            </button>
          </div>
        ) : loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-stone-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <BookX className="size-6 text-stone-300" />
            <p className="text-xs text-stone-500">
              {tab === 'pending' && '暂无待审核的打卡'}
              {tab === 'approved' && '暂无已通过的打卡'}
              {tab === 'rejected' && '暂无被驳回的打卡'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((b) => (
              <li
                key={b.id}
                className="rounded-md border border-stone-300 bg-[#fffdf5] p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-stone-900">{b.title}</p>
                    <p className="mt-0.5 text-[11px] text-stone-500">{b.author}</p>
                  </div>
                  <ReviewBadge status={b.reviewStatus} />
                </div>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  {formatWords(b.wordCount)}
                  {b.durationMinutes ? ` · ${formatReadingMinutes(b.durationMinutes)}` : ''}
                  {' · 第 '}
                  {b.tileIndex} 格
                </p>
                {b.aiReason && tab === 'pending' && (
                  <p className="mt-1 truncate rounded bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-400">
                    {b.aiReason}
                  </p>
                )}
                {tab === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void handleWithdraw(b)}
                    disabled={archived || withdrawing === b.checkInId}
                    className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2 text-[11px] font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    <Trash2 className="size-3" />
                    {withdrawing === b.checkInId ? '撤回中…' : '撤回'}
                  </button>
                )}
                {(tab === 'pending' || tab === 'approved') && (
                  <button
                    type="button"
                    onClick={() => void handleEdit(b)}
                    disabled={archived}
                    className="mt-2 ml-1.5 inline-flex h-7 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2 text-[11px] font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    <Pencil className="size-3" />
                    修改
                  </button>
                )}
                {tab === 'rejected' && (
                  <button
                    type="button"
                    onClick={() => setResubmitBook(b)}
                    disabled={!canResubmit}
                    className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2 text-[11px] font-bold shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    <RefreshCcw className="size-3" />
                    修改并重新提交
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {tab === 'rejected' && items.length > 0 && !canResubmit && (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800">
            重新提交仅可在队伍当前格进行（队伍在场且活动未结束时可用）。
          </p>
        )}
      </div>

      {resubmitBook && team && (
        <CheckInFormDialog
          tileIndex={team.position}
          onClose={() => {
            setResubmitBook(null)
            // 重新提交成功或关闭后刷新列表，避免旧状态残留
            void load()
          }}
          initialBooks={[
            {
              title: resubmitBook.title,
              author: resubmitBook.author,
              wordCount: resubmitBook.wordCount,
              durationMinutes: resubmitBook.durationMinutes,
              coverUrl: resubmitBook.coverUrl,
            },
          ]}
        />
      )}

      {editCheckIn && (
        <CheckInFormDialog
          tileIndex={editCheckIn.tileIndex}
          editCheckInId={editCheckIn.id}
          onClose={() => {
            setEditCheckIn(null)
            // 修改成功或关闭后刷新列表与棋盘（进度重算后需同步）
            void load()
            void useActivityStore.getState().refresh()
          }}
          initialBooks={editCheckIn.books.map<CheckInDraftBook>((b) => ({
            title: b.title,
            author: b.author,
            wordCount: b.wordCount,
            durationMinutes: b.durationMinutes,
            coverUrl: b.coverUrl,
            note: b.note,
          }))}
        />
      )}
    </div>
  )
}
