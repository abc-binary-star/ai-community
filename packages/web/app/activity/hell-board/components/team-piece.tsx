'use client'

import { cn } from '@/lib/utils'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/**
 * 队伍棋子：桌游角色徽章立在椭圆底座上，等轴视角的立体感用 CSS 实现，
 * 不引入 3D 引擎（PRD 10.2 非目标）。多枚棋子同格时由父级传入 offset 错位排布。
 */
export function TeamPiece({
  team,
  isSelf,
  size = 'md',
}: {
  team: Team
  isSelf: boolean
  size?: 'sm' | 'md'
}) {
  const emblemSize = size === 'sm' ? 16 : 20
  return (
    <span
      title={`${team.name}${isSelf ? '（本队）' : ''}`}
      className={cn('relative inline-flex flex-col items-center', isSelf && 'z-10')}
    >
      <span
        className={cn(
          'rounded-full transition-shadow',
          isSelf && 'ring-2 ring-stone-900/70 ring-offset-1 ring-offset-white',
        )}
      >
        <TeamEmblem emblem={team.emblem} size={emblemSize} className="drop-shadow-sm" />
      </span>
      {/* 椭圆投影，强化落在格面上的立体感 */}
      <span
        aria-hidden
        className="mt-[-2px] h-1 w-4 rounded-[100%] bg-black/40 blur-[1px]"
      />
    </span>
  )
}

/** 同格多队伍的棋子堆叠展示 */
export function PieceStack({
  teams,
  currentTeamId,
}: {
  teams: Team[]
  currentTeamId: string
}) {
  if (teams.length === 0) return null
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-wrap items-end justify-center gap-x-0.5 gap-y-0">
      {teams.map((team) => (
        <TeamPiece
          key={team.id}
          team={team}
          isSelf={team.id === currentTeamId}
          size={teams.length > 4 ? 'sm' : 'md'}
        />
      ))}
    </span>
  )
}
