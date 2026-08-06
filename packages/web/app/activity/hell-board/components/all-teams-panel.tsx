'use client'

import { useState } from 'react'
import { Crown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWords } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { Team, TeamMember } from '../lib/types'
import { MemberProfileDialog } from './member-profile-dialog'

/**
 * 全部队伍（侧边栏标签页）：展示所有队伍及成员（1-10 队）。
 * 点击成员打开阅读档案：已通过的累计数据（总本数 / 总字数 / 总时长），
 * 每次打卡可点赞并查看点赞数。
 */
export function AllTeamsPanel() {
  const teams = useActivityStore((s) => s.teams)
  const [selected, setSelected] = useState<{ member: TeamMember; teamName: string } | null>(
    null,
  )

  return (
    <div className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-white shadow-[4px_4px_0_#292524]">
      <div className="shrink-0 border-b-2 border-stone-800 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-black text-stone-900">
          <Users className="size-3.5 text-emerald-700" />
          全部队伍
        </p>
        <p className="mt-0.5 text-[10px] text-stone-500">
          {teams.length} 个队伍 · 点击成员查看已通过的阅读档案
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-6 text-stone-300" />
            <p className="text-xs text-stone-500">活动还没有配置小组</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {teams.map((team: Team) => (
              <section key={team.id} className="overflow-hidden rounded-md border border-stone-300">
                <div className="flex items-center gap-1.5 border-b border-stone-200 bg-[#f4f2e8] px-2 py-1.5">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="min-w-0 truncate text-xs font-bold text-stone-800">
                    {team.name}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-stone-400">
                    {team.members.length} 人 · 第 {team.position} 格
                  </span>
                </div>
                {team.members.length === 0 ? (
                  <p className="px-2 py-2 text-center text-[10px] text-stone-400">空位 · 等待队长拉人</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {team.members.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setSelected({ member: m, teamName: team.name })}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-[#fff4cf]"
                        >
                          <span
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                              m.isCaptain ? 'bg-amber-500' : 'bg-emerald-600',
                            )}
                          >
                            {m.name.slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 truncate text-xs font-medium text-stone-800">
                              <span className="truncate">{m.name}</span>
                              {m.isCaptain && <Crown className="size-3 shrink-0 text-amber-500" />}
                            </span>
                            <span className="block truncate text-[10px] text-stone-400">
                              {m.bookCount} 本 · {formatWords(m.wordCount)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                            查看
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
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
