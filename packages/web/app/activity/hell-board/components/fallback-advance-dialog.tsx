'use client'

import { useEffect, useState } from 'react'
import { Dices, Flame, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PENALTY_HOURS, PENALTY_TILE_INDEX } from '../lib/board'
import { formatDuration } from '../lib/rules'
import { useActivityStore, useCurrentTeam } from '../lib/store'

/**
 * 「消耗 40 本 · 向下一格进发」弹窗：任务未完成时，队长用全队累计的 40 本
 * 保底计数点亮当前格并前进。前进方式二选一：
 *   - 摇骰子：服务端随机生成 1–6 点；
 *   - 自选步数：直接点 +1~+6（适用于不想用网站摇骰的队伍）。
 * 落点规则与掷骰完全一致（含落入第 8 格启动惩罚计时）。
 */
export function FallbackAdvanceDialog({ onClose }: { onClose: () => void }) {
  const team = useCurrentTeam()
  const fallbackThreshold = useActivityStore((s) => s.fallbackThreshold)
  const fallbackAdvance = useActivityStore((s) => s.fallbackAdvance)
  const rolling = useActivityStore((s) => s.rolling)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!team) return null

  const handleAdvance = async (steps: number) => {
    if (busy !== null) return
    setBusy(steps === 0 ? -1 : steps)
    setError(null)
    try {
      await fallbackAdvance(steps)
      // 结果由棋盘刷新体现；这里直接关窗，避免与全局状态重复展示
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保底前进失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fallback-advance-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border-2 border-stone-800 bg-[#fffdf4] p-5 shadow-[6px_6px_0_#292524]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="fallback-advance-title" className="flex items-center gap-2 text-sm font-black text-stone-900">
            <Flame aria-hidden className="size-4 text-amber-600" />
            消耗 {fallbackThreshold} 本 · 向下一格进发
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          将消耗全队累计的 <b>{fallbackThreshold} 本</b>保底计数，点亮当前格并前进。
          选择前进方式：
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy !== null || rolling}
          onClick={() => void handleAdvance(0)}
          className={cn(
            'mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-stone-800 text-sm font-black shadow-[3px_3px_0_#292524] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none',
            busy === -1 ? 'bg-[#ffd166]' : 'bg-[#ffd166] hover:-translate-y-0.5 hover:bg-[#f5c34f]',
          )}
        >
          {busy === -1 ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
          {busy === -1 ? '摇骰中…' : '摇骰子前进'}
        </button>

        <p className="mt-3 text-center text-[11px] font-medium text-stone-400">或自选前进格数</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy !== null || rolling}
              onClick={() => void handleAdvance(n)}
              className={cn(
                'flex h-12 items-center justify-center rounded-md border-2 border-stone-800 text-base font-black shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none',
                busy === n ? 'bg-[#ffd166]' : 'bg-white hover:-translate-y-0.5 hover:bg-[#fff4cf]',
              )}
            >
              {busy === n ? <Loader2 className="size-4 animate-spin" /> : `+${n}`}
            </button>
          ))}
        </div>

        <p className="mt-2 text-center text-[11px] text-stone-400">
          落入第 {PENALTY_TILE_INDEX} 格会启动 {formatDuration(PENALTY_HOURS * 60 * 60 * 1000)} 惩罚计时
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
