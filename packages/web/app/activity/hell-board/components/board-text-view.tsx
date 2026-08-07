'use client'

import { TASK_TYPE_LABEL } from '../lib/board'
import { formatTileTarget } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { LitReason, Team } from '../lib/types'

const LIT_LABEL: Record<LitReason, string> = {
  task: '已点亮（任务达成）',
  fallback: '已点亮（保底完成）',
  timer: '已点亮（计时到期）',
  manual: '已点亮（人工修正）',
  initial: '已点亮（初始化补录）',
}

/**
 * 棋盘文本视图（PRD 10.2 / 验收标准 13）：
 * 以表格完整呈现 20 格状态与各队位置，保证读屏可用，可完整替代棋盘信息。
 */
export function BoardTextView({
  teams,
  currentTeam,
}: {
  teams: Team[]
  currentTeam: Team | null
}) {
  const tiles = useActivityStore((s) => s.tiles)
  return (
    <div className="overflow-x-auto rounded-lg border-2 border-stone-800 bg-white shadow-[4px_4px_0_#292524]">
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <caption className="sr-only">
          20 格棋盘状态一览，含任务、目标、特殊判定、本队点亮状态与各队当前位置
        </caption>
        <thead className="bg-[#dff3e7] text-stone-800">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">格</th>
            <th scope="col" className="px-3 py-2 font-medium">任务</th>
            <th scope="col" className="px-3 py-2 font-medium">类型</th>
            <th scope="col" className="px-3 py-2 font-medium">目标</th>
            <th scope="col" className="px-3 py-2 font-medium">特殊判定</th>
            <th scope="col" className="px-3 py-2 font-medium">本队状态</th>
            <th scope="col" className="px-3 py-2 font-medium">停留队伍</th>
          </tr>
        </thead>
        <tbody>
          {tiles.map((tile) => {
            const litReason = currentTeam?.litTiles[tile.index]
            const standing = teams.filter((t) => t.position === tile.index)
            const isCurrent = currentTeam?.position === tile.index
            return (
              <tr key={tile.index} className="border-t border-stone-200 text-stone-700">
                <th scope="row" className="px-3 py-2 font-black text-stone-900">
                  {tile.index}
                </th>
                <td className="px-3 py-2">{tile.title}</td>
                <td className="px-3 py-2 text-stone-500">{TASK_TYPE_LABEL[tile.taskType]}</td>
                <td className="px-3 py-2 text-stone-500">
                  {formatTileTarget(tile)}
                </td>
                <td className="px-3 py-2 text-stone-500">{tile.specialRule?.label ?? '无'}</td>
                <td className="px-3 py-2">
                  {litReason ? LIT_LABEL[litReason] : '未点亮'}
                  {isCurrent && <span className="ml-1 text-emerald-700">· 本队当前位置</span>}
                </td>
                <td className="px-3 py-2 text-stone-500">
                  {standing.length === 0
                    ? '—'
                    : standing
                        .map((t) => `${t.name}${t.id === currentTeam?.id ? '（本队）' : ''}`)
                        .join('、')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
