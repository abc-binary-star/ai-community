'use client'

import { Flag } from 'lucide-react'
import { TILE_COUNT } from '../lib/board'
import type { Team } from '../lib/types'

/**
 * 棋盘中心区：活动标题 + 本队点亮进度。
 * 不做跨队对比 —— 榜单面板的「点亮进度榜」已覆盖该口径，此处只回答「我到哪了」。
 */
export function BoardCenter({ currentTeam }: { currentTeam: Team | null }) {
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
    </div>
  )
}
