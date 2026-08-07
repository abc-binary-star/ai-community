'use client'

import { useState } from 'react'
import { Crown, Star, UserRoundPlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWords } from '../lib/rules'
import { useActivityStore, useCurrentTeam } from '../lib/store'
import type { Team, TeamMember } from '../lib/types'
import { MemberProfileDialog } from './member-profile-dialog'
import { TeamEmblem } from './team-emblem'

/** 队伍满编 5 人，不足时补空位占位，保证每张队伍卡高度一致 */
const TEAM_SIZE = 5

/**
 * 全部队伍：桌游纸张风的队伍档案墙（1-10 队）。
 *
 * 视觉与队伍卡 / 榜单统一：羊皮纸渐变底、硬阴影描边、菱形金饰、虚线分隔。
 * 宽屏下多列铺开，避免单列长条列表显得空旷；本队卡片额外加金色描边高亮。
 * 点击成员打开阅读档案：已通过的累计数据，可点赞。
 */
export function AllTeamsPanel() {
  const teams = useActivityStore((s) => s.teams)
  const myTeam = useCurrentTeam()
  const [selected, setSelected] = useState<{ member: TeamMember; teamName: string } | null>(
    null,
  )

  return (
    <div className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f4edda] shadow-[4px_4px_0_#292524]">
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-stone-800 px-4 py-3">
        <span aria-hidden className="size-2 rotate-45 bg-[#d9a441] shadow-[1px_1px_0_#8b6b2c]" />
        <h2 className="text-[13px] font-black uppercase tracking-[0.16em] text-[#6b4e15]">
          全部队伍
        </h2>
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#d9a441]/70 to-transparent" />
        <p className="shrink-0 text-[11px] font-medium text-stone-500">
          {teams.length} 支队伍 · 点击成员看阅读档案
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="size-7 text-stone-300" />
            <p className="text-xs text-stone-500">活动还没有配置小组</p>
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {teams.map((team: Team) => {
              const isMine = myTeam?.id === team.id
              const slots = Array.from({ length: TEAM_SIZE }, (_, i) => team.members[i] ?? null)
              return (
                <section
                  key={team.id}
                  className={cn(
                    'flex flex-col rounded-lg border-2 bg-gradient-to-b from-[#fffdf4] to-[#f7f0dc] p-3 shadow-[3px_3px_0_#292524]',
                    isMine ? 'border-[#d9a441] ring-2 ring-[#d9a441]/35' : 'border-stone-800',
                  )}
                >
                  {/* 队头：徽章 + 队名 + 当前位置 */}
                  <div className="flex items-center gap-2.5">
                    <TeamEmblem
                      emblem={team.emblem}
                      size={36}
                      className="shrink-0 drop-shadow-[2px_2px_0_rgba(41,37,36,0.3)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs font-black text-stone-900">
                        <span className="truncate">{team.name}</span>
                        {isMine && (
                          <span className="shrink-0 rounded bg-[#ffd166] px-1 py-px text-[9px] font-black text-[#5c430d]">
                            本队
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-stone-500">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full border border-stone-500/50"
                          style={{ backgroundColor: team.color }}
                        />
                        第 {team.position} 格 · 第 {team.lap} 圈
                      </p>
                    </div>
                  </div>

                  {/* 成员名单：与队伍卡同款虚线分隔与条目样式 */}
                  <div className="mt-3 border-t border-dashed border-[#dccfa8] pt-2.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-black tracking-wide text-[#6b4e15]">
                      <span aria-hidden className="size-1.5 rotate-45 bg-[#d9a441]" />
                      成员
                      <span className="ml-auto font-medium text-stone-400">
                        {team.members.length} / {TEAM_SIZE}
                      </span>
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {slots.map((m, i) =>
                        m ? (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => setSelected({ member: m, teamName: team.name })}
                              className="flex w-full items-center gap-1.5 rounded-md border border-[#dccfa8] bg-white/80 px-2 py-1.5 text-left text-[11px] shadow-[1.5px_1.5px_0_#e0d6ba] transition-colors hover:bg-[#fdf9ec]"
                            >
                              <span className="flex min-w-0 flex-1 items-center gap-1 font-bold text-stone-800">
                                <span className="truncate">{m.name}</span>
                                {m.isCaptain && (
                                  <Crown aria-label="队长" className="size-3 shrink-0 text-amber-600" />
                                )}
                              </span>
                              <span className="shrink-0 tabular-nums text-[10px] text-[#7a5c1e]">
                                <span className="inline-flex items-center gap-0.5">
                                  <Star aria-hidden className="size-2.5" />
                                  {m.bookCount}
                                </span>
                                <span className="ml-1.5 text-stone-500">{formatWords(m.wordCount)}</span>
                              </span>
                            </button>
                          </li>
                        ) : (
                          <li
                            key={`empty-${i}`}
                            aria-hidden
                            className="flex items-center gap-1.5 rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/60 px-2 py-1.5 text-[10px] text-stone-400"
                          >
                            <UserRoundPlus className="size-3" />
                            空位
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <MemberProfileDialog
          member={selected.member}
          teamName={selected.teamName}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
