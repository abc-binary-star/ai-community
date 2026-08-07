'use client'

import { useEffect, useState } from 'react'
import { Footprints, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PENALTY_HOURS, PENALTY_TILE_INDEX } from '../lib/board'
import { formatDuration } from '../lib/rules'
import { useActivityStore, useCurrentTeam } from '../lib/store'
import { Dice } from './dice'

/**
 * 「向下一格进发」弹窗：队长选择前进 1–6 格（替代程序摇骰随机点数）。
 *
 * 用于不想使用程序摇骰子的队伍：离开格同样按任务达成 / 保底完成点亮，
 * 落点逻辑与掷骰完全一致（含落入第 8 格启动惩罚计时）。
 */
export function AdvanceDialog({ onClose }: { onClose: () => void }) {
  const team = useCurrentTeam()
  const advanceTeam = useActivityStore((s) => s.advanceTeam)
  const rolling = useActivityStore((s) => s.rolling)
  const lastRoll = useActivityStore((s) => s.lastRoll)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ steps: number; from: number; to: number } | null>(null)

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
    setBusy(steps)
    setError(null)
    try {
      const res = await advanceTeam(steps)
      if (!res) return
      setResult({ steps: res.value, from: res.fromTile, to: res.toTile })
    } catch (err) {
      setError(err instanceof Error ? err.message : '前进失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="advance-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border-2 border-stone-800 bg-[#fffdf4] p-5 shadow-[6px_6px_0_#292524]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="advance-title" className="flex items-center gap-2 text-sm font-black text-stone-900">
            <Footprints aria-hidden className="size-4 text-emerald-700" />
            向下一格进发
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
          选择前进格数（1–6），与掷骰规则一致：离开格按任务达成或保底完成点亮，
          {team.position} 号格出发，落入第 {PENALTY_TILE_INDEX} 格会启动惩罚计时。
        </p>

        {result ? (
          <div className="mt-4 rounded-md border-2 border-stone-800 bg-white p-4 text-center shadow-[3px_3px_0_#292524]">
            <div className="flex items-center justify-center gap-3">
              <Dice value={result.steps} rolling={false} />
            </div>
            <p className="mt-2 text-sm font-black text-stone-900">
              已前进 {result.steps} 格：第 {result.from} 格 → 第 {result.to} 格
            </p>
            {result.to === PENALTY_TILE_INDEX && (
              <p className="mt-1.5 rounded bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">
                落入第 {PENALTY_TILE_INDEX} 格，启动 {formatDuration(PENALTY_HOURS * 60 * 60 * 1000)} 惩罚计时
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-3 h-9 w-full rounded-md border-2 border-stone-800 bg-[#78c6a3] text-xs font-black text-stone-900 shadow-[2px_2px_0_#292524] transition-colors hover:bg-[#65b891]"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
              >
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
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
            <p className="mt-2 text-center text-[11px] text-stone-400">点击对应格数即可前进</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
