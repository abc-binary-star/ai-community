'use client'

import { Crown, Star, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RAINBOW, RAINBOW_ORDER } from '../lib/board'
import { statusMeta } from '../lib/rules'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/** 全部队伍：每队展示当前格子、核心资产、7 色成员与 buff 概览 */
export function TeamsOverview({ teams, myTeamId }: { teams: Team[]; myTeamId: string | null }) {
  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-stone-800 bg-[#fffdf4] px-4 py-14 text-center shadow-[4px_4px_0_#292524]">
        <Users className="size-8 text-stone-300" />
        <p className="text-sm font-medium text-stone-500">活动还没有配置队伍，请等待运营完成名单录入</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3 lg:gap-5">
      {teams.map((team) => {
        const isMine = team.id === myTeamId
        const st = statusMeta(team.status)
        const memberByColor = new Map<string, string>()
        team.members.forEach((m) => {
          if (m.color) memberByColor.set(m.color, m.name)
        })
        const captain = team.members.find((m) => m.isCaptain)
        return (
          <section
            key={team.id}
            className={cn(
              'flex flex-col rounded-lg border-2 bg-gradient-to-b from-[#fffdf4] to-[#f7f0dc] p-4 shadow-[3px_3px_0_#292524]',
              isMine ? 'border-[#d9a441] ring-1 ring-[#d9a441]/40' : 'border-stone-800',
            )}
          >
            <div className="flex items-start gap-3">
              <TeamEmblem emblem={team.emblem} accent={team.color} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="text-[15px] font-black leading-snug break-words text-stone-900 sm:text-base">
                    {team.name}
                  </h2>
                  {isMine && <span className="shrink-0 rounded bg-[#ffd166] px-1.5 py-px text-[10px] font-black text-[#5c430d]">本队</span>}
                  <span className={cn('shrink-0 rounded border px-1.5 py-px text-[10px] font-black', st.chip)}>{st.label}</span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-stone-500">
                  <span className="font-black text-emerald-700">{team.position === 0 ? '起点未出发' : `当前第 ${team.position} 格`}</span>
                  {' · '}队长 {captain?.name ?? '未认领'}
                </p>
              </div>
            </div>

            {/* 资产 */}
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              {[
                { label: '掷骰机会', value: team.rollChances, cls: 'text-sky-700' },
                { label: '团队积分', value: team.points, cls: 'text-amber-700' },
                { label: '万能骰', value: team.universalDice, cls: 'text-violet-700' },
                { label: '彩虹轮', value: team.rainbowCount, cls: 'text-rose-600' },
              ].map((s) => (
                <div key={s.label} className="rounded border border-[#dccfa8] bg-white/80 px-1 py-1.5">
                  <p className={cn('tabular-nums text-lg font-black leading-none', s.cls)}>{s.value}</p>
                  <p className="mt-1 text-[10px] font-bold text-stone-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 成员 7 色 */}
            <div className="mt-3">
              <p className="text-[10px] font-black text-[#6b4e15]">本轮彩虹 · 7 色认领</p>
              <div className="mt-1.5 grid grid-cols-7 gap-1">
                {RAINBOW_ORDER.map((k) => {
                  const name = memberByColor.get(k)
                  const member = team.members.find((m) => m.color === k)
                  return (
                    <div
                      key={k}
                      title={`${RAINBOW[k].label}色${name ? `：${name}` : '（未认领）'}`}
                      className="flex min-w-0 flex-col items-center gap-1"
                    >
                      <span
                        aria-hidden
                        className={cn('size-3.5 shrink-0 rounded-full border border-stone-700/40 shadow-sm', !name && 'opacity-35 grayscale')}
                        style={{ backgroundColor: RAINBOW[k].hex }}
                      />
                      <span className="line-clamp-2 break-all text-center text-[10px] font-bold leading-tight text-stone-600">
                        {member?.isCaptain && <Crown aria-hidden className="inline size-2.5 align-[-1px] text-amber-600" />}
                        {name ?? '空'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* buff 概览 */}
            {team.buffs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {team.buffs.slice(0, 4).map((b, i) => (
                  <span
                    key={`${b.kind}-${i}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                    title={b.label}
                  >
                    <Star aria-hidden className="size-2.5 shrink-0 fill-amber-400 text-amber-500" />
                    <span className="truncate">{b.label}</span>
                  </span>
                ))}
                {team.buffs.length > 4 && (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-400">+{team.buffs.length - 4}</span>
                )}
              </div>
            )}

            {/* 成员数 */}
            <p className="mt-auto flex items-center gap-1 border-t border-dashed border-[#dccfa8] pt-2 text-[11px] font-medium text-stone-500">
              <Users className="size-3.5" />
              {team.members.length}/7 人 · 累计 {team.members.reduce((n, m) => n + m.bookCount, 0)} 本
            </p>
          </section>
        )
      })}
    </div>
  )
}