'use client'

import { useMemo, useState } from 'react'
import { Loader2, MapPin, Rocket, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActivityStore } from '../lib/store'
import type { Team } from '../lib/types'

/**
 * 队长初始化队伍进度（活动已开始后的补录）：
 * 选择起始格、已打卡（已点亮）格、当前格，一次性把线下真实进度录入系统。
 * 可重复执行：每次执行都把队伍状态对齐到本次声明，已点亮格保留原有点亮方式。
 */
export function TeamInitDialog({
  team,
  onClose,
}: {
  team: Team
  onClose: () => void
}) {
  const tiles = useActivityStore((s) => s.tiles)
  const initializeTeam = useActivityStore((s) => s.initializeTeam)

  const [startTile, setStartTile] = useState(1)
  const [litTiles, setLitTiles] = useState<Set<number>>(
    () => new Set(Object.keys(team.litTiles ?? {}).map(Number)),
  )
  const [currentTile, setCurrentTile] = useState(team.position)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 惩罚格（第 8 格）无阅读任务，只能由掷骰落入计时，不能作为当前格
  const penaltyTiles = useMemo(
    () => new Set(tiles.filter((t) => t.taskType === 'timed-penalty').map((t) => t.index)),
    [tiles],
  )

  const toggleLit = (index: number) => {
    if (index === currentTile) return
    setLitTiles((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const pickCurrent = (index: number) => {
    if (penaltyTiles.has(index)) return
    setCurrentTile(index)
    // 当前格不能同时是已点亮格
    setLitTiles((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (litTiles.has(currentTile)) {
      setError('当前格不能同时勾选为已打卡格子')
      return
    }
    if (penaltyTiles.has(currentTile)) {
      setError('惩罚格无阅读任务，不能作为当前格')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await initializeTeam({
        startTile,
        litTiles: Array.from(litTiles),
        currentTile,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="init-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] p-5 shadow-[6px_6px_0_#292524] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="init-title" className="text-lg font-black text-stone-900">
              队伍进度初始化
            </h2>
            <p className="mt-1 text-xs font-medium text-stone-500">
              活动已开始，请按线下真实进度录入：起始格、已打卡（已点亮）格与当前格。可重复执行，每次都会对齐到本次声明。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 起始格 */}
        <section className="mt-5">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-stone-500">
            <Rocket className="size-3.5 text-amber-600" />
            起始格子（仅记录）
          </h3>
          <p className="mt-1 text-[11px] text-stone-400">队伍出发时的位置，只用于留痕，不影响状态机。</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {tiles.map((t) => (
              <button
                key={t.index}
                type="button"
                onClick={() => setStartTile(t.index)}
                className={cn(
                  'h-9 rounded-md border-2 text-xs font-bold transition-colors',
                  startTile === t.index
                    ? 'border-amber-600 bg-amber-100 text-amber-900'
                    : 'border-stone-300 bg-white text-stone-600 hover:border-stone-500',
                )}
              >
                {t.index}
              </button>
            ))}
          </div>
        </section>

        {/* 已打卡格子 */}
        <section className="mt-5">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-stone-500">
            <ShieldCheck className="size-3.5 text-emerald-700" />
            已打卡格子（已点亮）
            <span className="ml-auto text-[10px] font-bold text-stone-400">{litTiles.size} 格</span>
          </h3>
          <p className="mt-1 text-[11px] text-stone-400">线下已完成并点亮的格子。保存后可对这些格子补卡。</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {tiles.map((t) => {
              const active = litTiles.has(t.index)
              const isCurrent = t.index === currentTile
              return (
                <button
                  key={t.index}
                  type="button"
                  onClick={() => toggleLit(t.index)}
                  disabled={isCurrent}
                  className={cn(
                    'h-9 rounded-md border-2 text-xs font-bold transition-colors',
                    active
                      ? 'border-emerald-600 bg-emerald-100 text-emerald-900'
                      : isCurrent
                        ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-300'
                        : 'border-stone-300 bg-white text-stone-600 hover:border-stone-500',
                  )}
                >
                  {t.index}
                </button>
              )
            })}
          </div>
        </section>

        {/* 当前格 */}
        <section className="mt-5">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-stone-500">
            <MapPin className="size-3.5 text-sky-600" />
            当前格子
          </h3>
          <p className="mt-1 text-[11px] text-stone-400">队伍现在所在、正在做任务的格子（不能是已点亮格或惩罚格）。</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {tiles.map((t) => {
              const active = t.index === currentTile
              const banned = penaltyTiles.has(t.index)
              return (
                <button
                  key={t.index}
                  type="button"
                  onClick={() => pickCurrent(t.index)}
                  disabled={banned}
                  className={cn(
                    'h-9 rounded-md border-2 text-xs font-bold transition-colors',
                    banned
                      ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-300'
                      : active
                        ? 'border-sky-600 bg-sky-100 text-sky-900'
                        : 'border-stone-300 bg-white text-stone-600 hover:border-stone-500',
                  )}
                >
                  {t.index}
                </button>
              )
            })}
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-lg border-2 border-stone-800 bg-white text-xs font-bold shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-none"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#78c6a3] text-xs font-black text-stone-900 transition-colors hover:bg-[#65b891] disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            保存初始化
          </button>
        </div>
      </div>
    </div>
  )
}
