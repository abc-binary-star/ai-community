'use client'

import { Dices, Flame, Hourglass, Lock, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_TYPE_LABEL } from '../lib/board'
import type { LitReason, Tile } from '../lib/types'

interface BoardTileProps {
  tile: Tile
  /** 本队是否已点亮该格，及点亮方式 */
  litReason?: LitReason
  /** 是否为本队当前所在格 */
  isCurrent: boolean
  onSelect: () => void
}

const LIT_LABEL: Record<LitReason, string> = {
  task: '任务达成',
  fallback: '保底完成',
  timer: '计时到期',
  manual: '人工修正',
}

export function BoardTile({ tile, litReason, isCurrent, onSelect }: BoardTileProps) {
  const isPenalty = tile.taskType === 'timed-penalty'
  const lit = Boolean(litReason)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`第 ${tile.index} 格 ${tile.title}${lit ? '，已点亮' : '，未点亮'}${
        tile.specialRule ? '，含特殊判定' : ''
      }`}
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group relative flex h-full min-h-[112px] w-full flex-col gap-1 rounded-md border-2 p-2 text-left shadow-[2px_2px_0_rgba(41,37,36,0.8)] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_rgba(41,37,36,0.8)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2',
        lit
          ? 'border-stone-800 bg-[#fff0b8]'
          : 'border-stone-700 bg-white hover:bg-[#fffdf5]',
        isCurrent && 'border-emerald-800 bg-[#d8f3e5] ring-4 ring-emerald-500/20',
        isPenalty && !lit && 'border-stone-800 bg-[#fef3c7]',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex size-7 items-center justify-center rounded border border-stone-800 text-[13px] font-black',
            lit ? 'bg-[#ffd166] text-stone-900' : 'bg-stone-800 text-white',
          )}
        >
          {tile.index}
        </span>
        <span className="flex items-center gap-1">
          {/* 点亮状态不只依赖颜色，同时用图标区分（PRD 10.2 无障碍） */}
          {lit && <Star aria-hidden className="size-3.5 fill-amber-400 text-stone-800" />}
          {tile.specialRule && <Dices aria-hidden className="size-3.5 text-violet-700" />}
          {isPenalty && <Hourglass aria-hidden className="size-3.5 text-amber-700" />}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] font-black leading-snug text-stone-900">{tile.title}</p>

      <div className="mt-auto space-y-0.5">
        <p className="text-[11px] font-medium text-stone-500">{TASK_TYPE_LABEL[tile.taskType]}</p>
        <p className="text-[11px] font-bold text-stone-700">
          {tile.taskType === 'total-words'
            ? '100w 字'
            : `${tile.target.toLocaleString('zh-CN')} ${tile.unit}`}
        </p>
        {litReason && (
          <p className="flex items-center gap-0.5 text-[10px] font-bold text-amber-800">
            {litReason === 'fallback' && <Flame aria-hidden className="size-3" />}
            {litReason === 'timer' && <Lock aria-hidden className="size-3" />}
            {LIT_LABEL[litReason]}
          </p>
        )}
      </div>
    </button>
  )
}
