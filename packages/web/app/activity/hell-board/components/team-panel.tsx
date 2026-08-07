'use client'

import { Crown, Star, UserRoundPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWords } from '../lib/rules'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/** 队伍成员满编 5 人，不足时用空槽占位，保证布局稳定 */
const TEAM_SIZE = 5

/**
 * 队伍卡：只呈现队伍身份与成员名单。
 * 时间线 / 补录 / 队伍管理等操作入口统一收在页头右上角工具条，
 * 避免按钮堆叠把卡片撑出右栏可视高度。
 */
export function TeamPanel({ team, currentMemberId }: { team: Team; currentMemberId: string }) {
  // 成员不足 5 人时用空槽补齐，保持卡片高度稳定
  const slots = Array.from({ length: TEAM_SIZE }, (_, i) => team.members[i] ?? null)

  return (
    <section
      aria-labelledby="team-heading"
      className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f4edda] p-4 shadow-[4px_4px_0_#292524]"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="team-heading" className="flex min-w-0 items-center gap-2.5 text-sm font-black text-stone-900">
          <span className="min-w-0 flex items-center gap-2.5">
            {/* 徽章本身是圆形盘面，不再套外圈圆环（与棋盘棋子修复一致） */}
            <TeamEmblem emblem={team.emblem} size={40} className="shrink-0 drop-shadow-[2px_2px_0_rgba(41,37,36,0.3)]" />
            <span className="truncate">{team.name}</span>
          </span>
        </h2>
      </div>

      {/* 名单区有界：卡片高度由右栏决定，成员多时名单自身滚动而非撑高卡片 */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-dashed border-[#dccfa8] pt-3.5">
        <h3 className="flex shrink-0 items-center gap-1.5 text-xs font-black tracking-wide text-[#6b4e15]">
          <span aria-hidden className="size-1.5 rotate-45 bg-[#d9a441]" />
          队伍成员
          <span className="ml-auto text-[11px] font-medium text-stone-400">
            {team.members.length} / {TEAM_SIZE}
          </span>
        </h3>
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {slots.map((member, i) =>
            member ? (
              <li
                key={member.id}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs shadow-[1.5px_1.5px_0_#e0d6ba]',
                  member.id === currentMemberId
                    ? 'border-[#d9a441] bg-[#fff3d6] ring-1 ring-[#d9a441]/40'
                    : 'border-[#dccfa8] bg-white/80 hover:bg-[#fdf9ec]',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-stone-800">
                  <span className="truncate">{member.name}</span>
                  {member.isCaptain && <Crown aria-label="队长" className="size-3 shrink-0 text-amber-600" />}
                  {member.id === currentMemberId && <span className="shrink-0 text-[10px] text-emerald-700">你</span>}
                </span>
                <span className="shrink-0 tabular-nums text-stone-500">
                  <span className="inline-flex items-center gap-0.5 text-[#7a5c1e]">
                    <Star aria-hidden className="size-3" />
                    {member.bookCount} 本
                  </span>
                  <span className="ml-2">{formatWords(member.wordCount)}</span>
                </span>
              </li>
            ) : (
              <li
                key={`empty-${i}`}
                aria-hidden
                className="flex items-center gap-2 rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/60 px-2.5 py-2 text-xs text-stone-400"
              >
                <UserRoundPlus className="size-3.5" />
                空位 · 等待队长拉人
              </li>
            ),
          )}
        </ul>
      </div>

    </section>
  )
}
