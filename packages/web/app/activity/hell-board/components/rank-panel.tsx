'use client'

import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RankingRow } from '../lib/types'

/** 进度榜：位置降序（服务端已按规则排序） */
export function RankPanel({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-stone-800 bg-white p-6 text-center shadow-[3px_3px_0_#292524]">
        <Trophy className="size-6 text-stone-300" />
        <p className="text-xs text-stone-500">暂无队伍数据</p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border-2 border-stone-800 bg-white shadow-[3px_3px_0_#292524]">
      <div className="flex items-center gap-1.5 border-b-2 border-stone-800 bg-[#fffdf4] px-3 py-2">
        <span aria-hidden className="size-2 rotate-45 bg-[#d9a441]" />
        <p className="text-[12px] font-black tracking-wide text-[#6b4e15]">棋盘进度榜</p>
        <span aria-hidden className="ml-1 h-px flex-1 bg-gradient-to-r from-[#d9a441]/70 to-transparent" />
      </div>
      <ul className="divide-y divide-[#dccfa8]">
        {rows.map((row, i) => (
          <li
            key={row.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2',
              row.isSelf && 'bg-[#fff4cf]',
            )}
          >
            <span
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-black',
                i === 0
                  ? 'border-amber-700 bg-[#ffd166] text-amber-950'
                  : i === 1
                    ? 'border-stone-400 bg-stone-200 text-stone-700'
                    : i === 2
                      ? 'border-orange-400 bg-orange-200 text-orange-900'
                      : 'border-stone-300 bg-white text-stone-500',
              )}
            >
              {row.rank}
            </span>
            <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-stone-500/50" style={{ backgroundColor: row.color }} />
            <span className={cn('min-w-0 flex-1 truncate text-[12px] font-bold text-stone-800', row.isSelf && 'text-amber-900')}>
              {row.name}
              {row.isSelf && <span className="ml-1 text-[9px] font-black text-amber-700">本队</span>}
            </span>
            <span className="shrink-0 tabular-nums text-[11px] font-black text-emerald-700">第 {row.position} 格</span>
            <span className="shrink-0 text-right tabular-nums text-[10px] text-stone-500">
              积 {row.points}
              <span className="ml-1.5 inline-flex items-center gap-0.5">
                <span aria-hidden className="size-1.5 rounded-full bg-violet-400" />{row.universalDice}
              </span>
              <span className="ml-1.5">{row.rainbowCount} 轮</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}