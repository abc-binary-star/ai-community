'use client'

import { useState } from 'react'
import { ClipboardList, Crown, Settings2, Star, UserRoundPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWords } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'
import { TeamInitDialog } from './team-init-dialog'
import { TeamManageDialog } from './team-manage-dialog'

/** 队伍成员满编 5 人，不足时用空槽占位，保证布局稳定 */
const TEAM_SIZE = 5

export function TeamPanel({ team, currentMemberId }: { team: Team; currentMemberId: string }) {
  // 队伍管理仅对队长开放：改队名 / 一次性选形象 / 从报名名单拉人
  const isCaptain = useActivityStore((s) => s.isCaptain)
  const archived = useActivityStore((s) => s.archived)
  const [showTeamManage, setShowTeamManage] = useState(false)
  const [showTeamInit, setShowTeamInit] = useState(false)

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
        {isCaptain && (
          <button
            type="button"
            onClick={() => setShowTeamManage(true)}
            aria-label="队伍管理"
            title="队伍管理"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2 py-1 text-[11px] font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 hover:text-amber-800 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <Settings2 className="size-3.5" />
            队伍管理
          </button>
        )}
      </div>

      {/* 活动已开始后的进度补录：队长按线下真实情况录入起始格/已点亮格/当前格 */}
      {isCaptain && (
        <button
          type="button"
          onClick={() => setShowTeamInit(true)}
          disabled={archived}
          className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-[#8b6b2c] bg-[#fff8e5] px-2 text-[11px] font-bold text-[#7a5c1e] transition-colors hover:bg-[#fff3d6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ClipboardList className="size-3.5" />
          进度初始化 / 补录
        </button>
      )}

      <div className="mt-4 flex-1 border-t border-dashed border-[#dccfa8] pt-3.5">
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-wide text-[#6b4e15]">
          <span aria-hidden className="size-1.5 rotate-45 bg-[#d9a441]" />
          队伍成员
          <span className="ml-auto text-[11px] font-medium text-stone-400">
            {team.members.length} / {TEAM_SIZE}
          </span>
        </h3>
        <ul className="mt-2 space-y-1.5">
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

      {showTeamManage && (
        <TeamManageDialog team={team} onClose={() => setShowTeamManage(false)} />
      )}

      {showTeamInit && (
        <TeamInitDialog team={team} onClose={() => setShowTeamInit(false)} />
      )}
    </section>
  )
}
