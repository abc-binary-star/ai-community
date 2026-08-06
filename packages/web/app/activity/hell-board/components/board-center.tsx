'use client'

import { useMemo } from 'react'
import { Flag, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TILE_COUNT } from '../lib/board'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

interface StandingRow {
  id: string
  name: string
  emblem?: string
  litCount: number
  position: number
  isSelf: boolean
}

/** 各队点亮进度对比。手机端中心区太窄，仅在 md 及以上展示 */
function TeamStandings({ rows }: { rows: StandingRow[] }) {
  if (!rows.length) return null

  return (
    <div className="mt-3 hidden w-full max-w-[520px] md:block">
      <p className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#6b4e15]">
        <Trophy aria-hidden className="size-3" />
        点亮进度对比
      </p>
      <ul className="mt-2 grid gap-x-4 gap-y-1 lg:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              'flex items-center gap-1.5 rounded px-1.5 py-0.5',
              row.isSelf && 'bg-[#e4f4ec] ring-1 ring-emerald-600/30',
            )}
          >
            <TeamEmblem emblem={row.emblem} size={16} className="shrink-0" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[11px] font-bold text-stone-700',
                row.isSelf && 'text-emerald-900',
              )}
            >
              {row.name}
              {row.isSelf && <span className="ml-1 text-[9px] font-black text-emerald-700">本队</span>}
            </span>
            <span
              aria-hidden
              className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full border border-[#8b6b2c]/25 bg-[#efe6cd]"
            >
              <span
                className="block h-full rounded-full bg-[#4da683]"
                style={{ width: `${(row.litCount / TILE_COUNT) * 100}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-[10px] font-black tabular-nums text-[#1d6a4a]">
              {row.litCount}/{TILE_COUNT}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 棋盘中心战况区：替代原先的颜色图例（两态配色后图例已无信息量）。
 * 展示全队点亮进度对比 —— 这是活动的主进度口径，也是周期结束的胜负依据。
 */
export function BoardCenter({
  teams,
  currentTeam,
}: {
  teams: Team[]
  currentTeam: Team | null
}) {
  const standings = useMemo<StandingRow[]>(() => {
    return teams
      .map((team) => ({
        id: team.id,
        name: team.name,
        emblem: team.emblem,
        litCount: Object.keys(team.litTiles).length,
        position: team.position,
        isSelf: team.id === currentTeam?.id,
      }))
      .sort((a, b) => b.litCount - a.litCount || a.name.localeCompare(b.name, 'zh-CN'))
  }, [teams, currentTeam?.id])

  const selfLit = currentTeam ? Object.keys(currentTeam.litTiles).length : 0

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      <span className="rounded border border-[#8b6b2c]/50 bg-[#efe6cd] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#6b4e15]">
        Reading Hell
      </span>
      <h2 className="mt-2 text-base font-black leading-tight text-stone-900 md:mt-2.5 md:text-xl lg:text-2xl">
        无限循环读书地狱
      </h2>
      <div className="mt-1.5 h-px w-20 bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent" />

      {/* 本队进度：手机端中心区仅约 156px 宽，这块是唯一保留的主信息 */}
      <div className="mt-2.5 flex w-full max-w-[220px] flex-col items-center md:mt-3">
        <p className="flex items-baseline gap-1 tabular-nums">
          <span className="text-2xl font-black leading-none text-[#1d6a4a] md:text-3xl">
            {currentTeam ? selfLit : '—'}
          </span>
          <span className="text-[11px] font-bold text-stone-500">/ {TILE_COUNT} 格已点亮</span>
        </p>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full border border-[#8b6b2c]/35 bg-[#efe6cd]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#78c6a3] to-[#3f9d76] transition-[width] duration-500"
            style={{ width: `${(selfLit / TILE_COUNT) * 100}%` }}
          />
        </div>
        <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-stone-500">
          <Flag aria-hidden className="size-3 text-emerald-700" />
          {currentTeam ? `本队在第 ${currentTeam.position} 格 · 第 ${currentTeam.lap} 轮` : '观战中'}
        </p>
      </div>

      <TeamStandings rows={standings} />
    </div>
  )
}
