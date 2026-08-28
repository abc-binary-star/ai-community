'use client'

import { Crown, Sparkles, Star, Users, Zap } from 'lucide-react'
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {teams.map((team) => {
        const isMine = team.id === myTeamId
        const st = statusMeta(team.status)
        const memberByColor = new Map<string, string>()
        team.members.forEach((m) => {
          if (m.color) memberByColor.set(m.color, m.name)
        })
        return (
          <section
            key={team.id}
            className={cn(
              'flex flex-col rounded-lg border-2 bg-gradient-to-b from-[#fffdf4] to-[#f7f0dc] p-3 shadow-[3px_3px_0_#292524]',
              isMine ? 'border-[#d9a441] ring-1 ring-[#d9a441]/40' : 'border-stone-800',
            )}
          >
            <div className="flex items-center gap-2.5">
              <TeamEmblem emblem={team.emblem} accent={team.color} size={38} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[13px] font-black text-stone-900">
                  {team.name}
                  {isMine && <span className="shrink-0 rounded bg-[#ffd166] px-1 py-px text-[9px] font-black text-[#5c430d]">本队</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-stone-500">
                  <span className={cn('rounded border px-1 py-px font-black', st.chip)}>{st.label}</span>
                  <span className="font-black text-emerald-700">{team.position === 0 ? '起点' : `第 ${team.position} 格`}</span>
                </p>
              </div>
            </div>

            {/* 资产 */}
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">
              {[
                { label: '机会', value: team.rollChances, cls: 'text-sky-700' },
                { label: '积分', value: team.points, cls: 'text-amber-700' },
                { label: '万能骰', value: team.universalDice, cls: 'text-violet-700' },
                { label: '彩虹', value: team.rainbowCount, cls: 'text-rose-600' },
              ].map((s) => (
                <div key={s.label} className="rounded border border-[#dccfa8] bg-white/80 px-1 py-1">
                  <p className={cn('tabular-nums text-[13px] font-black leading-none', s.cls)}>{s.value}</p>
                  <p className="mt-0.5 text-[9px] font-bold text-stone-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 成员 7 色 */}
            <div className="mt-2 flex items-center gap-0.5">
              {RAINBOW_ORDER.map((k) => {
                const name = memberByColor.get(k)
                const member = team.members.find((m) => m.color === k)
                return (
                  <span
                    key={k}
                    title={`${RAINBOW[k].label}色${name ? `：${name}` : '（未认领）'}`}
                    className="flex min-w-0 flex-1 items-center gap-0.5"
                  >
                    <span
                      aria-hidden
                      className={cn('size-3 shrink-0 rounded-full border border-stone-700/40 shadow-sm', !name && 'opacity-35 grayscale')}
                      style={{ backgroundColor: RAINBOW[k].hex }}
                    />
                    <span className="hidden truncate text-[9px] font-bold text-stone-600 lg:inline">
                      {member?.isCaptain ? <Crown className="inline size-2.5 text-amber-600" /> : null}
                      {name ?? ''}
                    </span>
                  </span>
                )
              })}
            </div>

            {/* buff 概览 */}
            {team.buffs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {team.buffs.slice(0, 3).map((b, i) => (
                  <span
                    key={`${b.kind}-${i}`}
                    className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[9px] font-bold text-amber-900"
                    title={b.label}
                  >
                    <Star aria-hidden className="size-2 shrink-0 fill-amber-400 text-amber-500" />
                    <span className="truncate">{b.label}</span>
                  </span>
                ))}
                {team.buffs.length > 3 && (
                  <span className="rounded-full bg-stone-100 px-1.5 py-px text-[9px] font-bold text-stone-400">+{team.buffs.length - 3}</span>
                )}
              </div>
            )}

            {/* 成员数 */}
            <p className="mt-2 flex items-center gap-1 border-t border-dashed border-[#dccfa8] pt-1.5 text-[10px] font-medium text-stone-500">
              <Users className="size-3" />
              {team.members.length}/7 人
              <span className="ml-auto inline-flex items-center gap-0.5">
                <Sparkles className="size-3 text-amber-500" />积 {team.points}
                <Zap className="ml-1 size-3 text-violet-500" />{team.universalDice}
              </span>
            </p>
          </section>
        )
      })}
    </div>
  )
}