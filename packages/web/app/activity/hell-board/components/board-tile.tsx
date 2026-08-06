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
        'group relative flex h-full min-h-[92px] w-full flex-col gap-0.5 rounded-md border-2 p-1.5 text-left shadow-[2px_2px_0_rgba(41,37,36,0.8)] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_rgba(41,37,36,0.8)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none md:min-h-[112px] md:gap-1 md:p-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2',
        // 只区分两态：未点亮白色 / 已点亮绿色
        lit
          ? 'border-stone-800 bg-[#8fd3ae]'
          : 'border-stone-700 bg-white hover:bg-[#f6faf7]',
        isCurrent && 'border-emerald-800 ring-4 ring-emerald-500/25',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex size-6 items-center justify-center rounded border border-stone-800 text-[11px] font-black md:size-7 md:text-[13px]',
            lit ? 'bg-white/85 text-stone-900' : 'bg-stone-800 text-white',
          )}
        >
          {tile.index}
        </span>
        <span className="flex items-center gap-0.5 md:gap-1">
          {/* 点亮状态不只依赖颜色，同时用图标区分（PRD 10.2 无障碍） */}
          {lit && <Star aria-hidden className="size-3 fill-emerald-800 text-emerald-900 md:size-3.5" />}
          {tile.specialRule && <Dices aria-hidden className="size-3 text-violet-700 md:size-3.5" />}
          {isPenalty && <Hourglass aria-hidden className="size-3 text-amber-700 md:size-3.5" />}
        </span>
      </div>

      <p className="line-clamp-2 text-[11px] font-black leading-snug text-stone-900 md:text-[13px]">
        {tile.title}
      </p>

      <div className="mt-auto space-y-0.5">
        {/* 手机端 78px 格宽放不下类型标签，点开详情弹窗仍可见 */}
        <p className="hidden text-[11px] font-medium text-stone-500 md:block">
          {TASK_TYPE_LABEL[tile.taskType]}
        </p>
        <p className="text-[10px] font-bold text-stone-700 md:text-[11px]">
          {tile.taskType === 'total-words'
            ? '100w 字'
            : `${tile.target.toLocaleString('zh-CN')} ${tile.unit}`}
        </p>
        {litReason && (
          <p className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-900">
            {litReason === 'fallback' && <Flame aria-hidden className="size-3" />}
            {litReason === 'timer' && <Lock aria-hidden className="size-3" />}
            {LIT_LABEL[litReason]}
          </p>
        )}
      </div>
    </button>
  )
}
