'use client'

import { useEffect } from 'react'
import { ArrowLeft, ArrowRight, ArrowRightLeft, Flag, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KIND_META, isFinish } from '../lib/board'
import { tileDetailText } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import { Dialog, DialogCloseButton } from './dialog'
import { MapTile } from './map-tile'
import { TeamToken } from './team-token'

/** 格子详情弹窗：类型 + 文案 + 效果参数 + 停靠队伍，支持左右翻格 */
export function TileInfoDialog({ index, onClose }: { index: number; onClose: () => void }) {
  const tile = useActivityStore((s) => s.tiles.find((t) => t.index === index))
  const teams = useActivityStore((s) => s.teams)
  const selectTile = useActivityStore((s) => s.selectTile)

  // 左右方向键翻格
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 1) {
        e.stopPropagation()
        selectTile(index - 1)
      } else if (e.key === 'ArrowRight' && index < 100) {
        e.stopPropagation()
        selectTile(index + 1)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [index, selectTile])

  if (!tile) {
    return (
      <Dialog open={index !== null} onClose={onClose}>
        <div className="p-6 text-sm text-stone-600">格子不存在</div>
      </Dialog>
    )
  }
  const meta = KIND_META[tile.kind]
  const finish = isFinish(tile.index)
  const standing = teams.filter((t) => t.position === tile.index)

  return (
    <Dialog open onClose={onClose} labelledBy="tile-info-title">
      <div className="flex items-center gap-2 border-b-2 border-stone-800 px-4 py-3">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-black', meta.chip)}>{meta.label}</span>
        <p id="tile-info-title" className="text-sm font-black text-stone-900">第 {tile.index} 格</p>
        <DialogCloseButton onClose={onClose} />
      </div>

      <div className="flex gap-3 px-4 py-4">
        <div className="size-16 shrink-0">
          <MapTile tile={tile} lod="detail" angle={0} onSelect={() => undefined} active={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-1 text-[15px] font-black leading-snug text-stone-900">
            <Info className="mt-0.5 size-3.5 shrink-0 text-stone-400" />
            {tileDetailText(tile)}
          </p>
          {tile.kind === 'swap' && (tile.twin ?? 0) > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-sky-700">
              <ArrowRightLeft className="size-3" />
              踩中后与第 {tile.twin} 格互换位置
            </p>
          )}
          {finish && <Flag className="mt-2 size-5 text-amber-500" aria-hidden />}
        </div>
      </div>

      {standing.length > 0 && (
        <div className="flex items-center gap-2 border-t-2 border-dashed border-[#dccfa8] px-4 py-2.5">
          <span className="text-[10px] font-black text-[#6b4e15]">当前停靠</span>
          <span className="flex items-center gap-1">
            {standing.map((t) => (
              <TeamToken key={t.id} team={t} isSelf={false} size={18} />
            ))}
          </span>
        </div>
      )}

      {/* 翻格按钮 */}
      <div className="flex items-center justify-between border-t-2 border-stone-800 px-3 py-2">
        <button
          type="button"
          disabled={index <= 1}
          onClick={() => selectTile(index - 1)}
          className="inline-flex items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          <ArrowLeft className="size-3" /> 上一格
        </button>
        <span className="text-[10px] font-bold text-stone-400">{index} / 100</span>
        <button
          type="button"
          disabled={index >= 100}
          onClick={() => selectTile(index + 1)}
          className="inline-flex items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          下一格 <ArrowRight className="size-3" />
        </button>
      </div>
    </Dialog>
  )
}
