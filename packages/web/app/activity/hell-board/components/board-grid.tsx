'use client'

import { useMemo, type CSSProperties } from 'react'
import {
  BOARD_COLS,
  BOARD_COLS_SM,
  BOARD_ROWS,
  BOARD_ROWS_SM,
  tileCell,
  tileCellSm,
} from '../lib/board'
import { useActivityStore } from '../lib/store'
import type { Team } from '../lib/types'
import { BoardCenter } from './board-center'
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
      className="board-ring"
      style={
        {
          '--ring-cols': BOARD_COLS,
          '--ring-rows': BOARD_ROWS,
          '--ring-cols-sm': BOARD_COLS_SM,
          '--ring-rows-sm': BOARD_ROWS_SM,
        } as CSSProperties
      }
    >
      {tiles.map((tile) => {
        const cell = tileCell(tile.index)
        const cellSm = tileCellSm(tile.index)
        const standing = teamsByTile.get(tile.index) ?? []
        return (
          <div
            key={tile.index}
            className="board-ring-cell relative"
            style={
              {
                '--cell-col': cell.col,
                '--cell-row': cell.row,
                '--cell-col-sm': cellSm.col,
                '--cell-row-sm': cellSm.row,
              } as CSSProperties
            }
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

      {/* 棋盘中心：活动标题 + 点亮进度战况 */}
      <div className="board-ring-center relative flex flex-col items-center justify-center overflow-hidden p-2.5 text-center md:p-5">
        {/* 羊皮纸底卡 */}
        <div className="absolute inset-0 rounded-xl border-2 border-[#8b6b2c]/40 bg-gradient-to-b from-[#fffdf4] via-[#fbf3dc] to-[#f0e4c4] shadow-[inset_0_2px_6px_rgba(139,107,44,0.15)]" />
        {/* 四角装饰 */}
        <span aria-hidden className="absolute left-2 top-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />
        <span aria-hidden className="absolute right-2 top-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />
        <span aria-hidden className="absolute bottom-2 left-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />
        <span aria-hidden className="absolute bottom-2 right-2 size-2.5 rounded-full border border-[#c9a84c] bg-[#fff3d6]" />

        <BoardCenter teams={teams} currentTeam={currentTeam} />
      </div>
    </div>
  )
}
