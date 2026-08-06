'use client'

import { useMemo } from 'react'
import { BOARD_COLS, BOARD_ROWS, tileCell } from '../lib/board'
import { useActivityStore } from '../lib/store'
import type { Team } from '../lib/types'
import { BoardTile } from './board-tile'
import { PieceStack } from './team-piece'

/**
 * 20 格矩形环棋盘（PRD 10.2）：7×5 网格外圈，顺时针上 6 / 右 4 / 下 6 / 左 4。
 * 中心留白区展示活动信息。
 *
 * currentTeam 为 null 时是观战视角：不高亮任何队伍位置与点亮状态。
 */
export function BoardGrid({
  teams,
  currentTeam,
  onSelectTile,
}: {
  teams: Team[]
  currentTeam: Team | null
  onSelectTile: (index: number) => void
}) {
  // 格子定义由服务端下发，运营改过的文案能即时生效（PRD 第 13 节）
  const tiles = useActivityStore((s) => s.tiles)
  // 格子编号 → 停在该格的队伍列表
  const teamsByTile = useMemo(() => {
    const map = new Map<number, Team[]>()
    teams.forEach((team) => {
      const list = map.get(team.position) ?? []
      list.push(team)
      map.set(team.position, list)
    })
    return map
  }, [teams])

  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(96px, 1fr))`,
        gridTemplateRows: `repeat(${BOARD_ROWS}, minmax(112px, auto))`,
      }}
    >
      {tiles.map((tile) => {
        const cell = tileCell(tile.index)
        const standing = teamsByTile.get(tile.index) ?? []
        return (
          <div
            key={tile.index}
            className="relative"
            style={{ gridColumn: cell.col, gridRow: cell.row }}
          >
            <BoardTile
              tile={tile}
              litReason={currentTeam?.litTiles[tile.index]}
              isCurrent={currentTeam?.position === tile.index}
              onSelect={() => onSelectTile(tile.index)}
            />
            <PieceStack teams={standing} currentTeamId={currentTeam?.id ?? ''} />
          </div>
        )
      })}

      {/* 棋盘中心留白：活动标题与规则要点 + 图例 */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden p-5 text-center"
        style={{ gridColumn: `2 / ${BOARD_COLS}`, gridRow: `2 / ${BOARD_ROWS}` }}
      >
        {/* 羊皮纸底卡 */}
        <div className="absolute inset-0 rounded-xl border-2 border-[#8b6b2c]/40 bg-gradient-to-b from-[#fffdf4] via-[#fbf3dc] to-[#f0e4c4] shadow-[inset_0_2px_6px_rgba(139,107,44,0.15)]" />
        {/* 四角装饰 */}
        <span aria-hidden className="absolute left-2 top-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />
        <span aria-hidden className="absolute right-2 top-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />
        <span aria-hidden className="absolute bottom-2 left-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />
        <span aria-hidden className="absolute bottom-2 right-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />

        <div className="relative flex flex-col items-center">
          <span className="rounded border border-[#8b6b2c]/50 bg-[#efe6cd] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#6b4e15]">
            Reading Hell
          </span>
          <h2 className="mt-2.5 text-xl font-black text-stone-900 lg:text-2xl">无限循环读书地狱</h2>
          <div className="mt-1.5 h-px w-20 bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent" />
          <p className="mt-2 max-w-sm text-[11px] font-medium leading-relaxed text-stone-600">
            20 格环形棋盘，完成当前格任务后掷骰前进。骰子会跨过格子，需绕圈多轮才能点亮全部格子；已点亮格子再次落入仍需完成任务，但不重复计入点亮数。
          </p>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-bold text-stone-600">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3.5 rounded-sm border border-stone-800 bg-[#ffd166] shadow-[1px_1px_0_rgba(139,107,44,0.4)]" />
              已点亮
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3.5 rounded-sm border-2 border-emerald-700 bg-white" />
              本队当前位置
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3.5 rounded-sm border border-stone-800 bg-[#a78bfa]" />
              特殊判定
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3.5 rounded-sm border border-stone-800 bg-[#f5e6a0]" />
              计时惩罚
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
