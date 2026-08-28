'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { Team } from '../lib/types'

/**
 * 地图上的精致纯色棋子：以队伍色为单色主体的 2.5D 球体。
 * 高光、内阴影、描边与底部投影营造立体感；我队/完成态有额外标记。
 * 纯色用 team.color 直接着色，不依赖 color-mix（兼容性更好）。
 */
export const TeamToken = memo(function TeamToken({
  team,
  isSelf,
  size = 20,
}: {
  team: Team
  isSelf: boolean
  size?: number
}) {
  const color = team.color || '#8a8a8a'
  return (
    <span
      title={`${team.name}（第 ${team.position} 格）`}
      aria-label={`${team.name}，第 ${team.position} 格${isSelf ? '，我的队伍' : ''}`}
      className={cn(
        'relative inline-flex items-center justify-center rounded-full',
        isSelf && 'z-10',
      )}
      style={{ width: size, height: size }}
    >
      {/* 底部接触阴影 */}
      <span
        aria-hidden
        className="absolute bottom-[4%] left-[12%] right-[12%] h-[18%] rounded-[50%] bg-[#493d34]/40 blur-[1.5px]"
      />
      {/* 纯色球体主体（2.5D：纯色 + 高光阴影，不依赖 color-mix） */}
      <span
        className="absolute inset-[7%] rounded-full"
        style={{
          background: color,
          border: '2px solid rgba(255,255,255,0.75)',
          boxShadow:
            'inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -3px 5px rgba(0,0,0,0.32), 0 1px 2px rgba(0,0,0,0.35)',
        }}
      />
      {/* 顶部高光点 */}
      <span
        aria-hidden
        className="absolute left-[24%] top-[16%] h-[22%] w-[26%] rounded-[50%] bg-white/70 blur-[0.5px]"
      />
      {/* 队伍首字 */}
      <span
        className="relative z-[1] text-[10px] font-black leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
        style={{ fontSize: Math.max(7, size * 0.4) }}
      >
        {team.name.slice(0, 1)}
      </span>
      {team.status === 'completed' && (
        <span className="absolute -right-1.5 -top-1.5 text-[11px] leading-none drop-shadow">🏆</span>
      )}
    </span>
  )
})