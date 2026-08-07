'use client'

import { TILE_COUNT } from '../lib/board'
import type { Team } from '../lib/types'

/** 进度环参数：半径与周长用于 stroke-dasharray 动画 */
const RING_R = 46
const RING_C = 2 * Math.PI * RING_R

/**
 * 棋盘中心区：桌游封面式铭牌 + 本队点亮进度环。
 *
 * 视觉上要压住整块棋盘的正中，所以用「烫金圆环 + 羊皮纸铭牌」的实体感做法：
 * 外层双描边圆盘模拟压印底座，进度用环形刻度而非条形进度条，
 * 与外圈方形格子形成圆/ 方对比，也避免了横条把中心切成两半。
 *
 * 不做跨队对比 —— 榜单的「点亮进度榜」已覆盖该口径，此处只回答「我到哪了」。
 */
export function BoardCenter({ currentTeam }: { currentTeam: Team | null }) {
  const selfLit = currentTeam ? Object.keys(currentTeam.litTiles).length : 0
  const pct = selfLit / TILE_COUNT

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-2">
      {/* 底纹：羊皮纸放射光 + 细网格，压住中心大片留白 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, #fffdf2 0%, #f6edd6 45%, #ecdfc0 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#292524 1px, transparent 1px), linear-gradient(90deg, #292524 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* 进度环 + 环心读数 */}
        <div className="relative">
          <svg
            viewBox="0 0 120 120"
            className="size-[104px] -rotate-90 md:size-[124px]"
            role="img"
            aria-label={`已点亮 ${selfLit} 格，共 ${TILE_COUNT} 格`}
          >
            {/* 压印底座：双圈描边 */}
            <circle cx="60" cy="60" r="56" fill="#fffdf4" stroke="#292524" strokeWidth="2.5" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="#d9a441" strokeWidth="1" opacity="0.55" />
            {/* 刻度：20 格对应 20 段，暗示外圈格子数 */}
            <circle
              cx="60"
              cy="60"
              r={RING_R}
              fill="none"
              stroke="#e0d3ae"
              strokeWidth="7"
              strokeDasharray={`${RING_C / TILE_COUNT - 3} 3`}
            />
            {/* 已点亮段 */}
            <circle
              cx="60"
              cy="60"
              r={RING_R}
              fill="none"
              stroke="url(#litGrad)"
              strokeWidth="7"
              strokeLinecap="butt"
              strokeDasharray={`${RING_C * pct} ${RING_C}`}
              className="transition-[stroke-dasharray] duration-700"
            />
            <defs>
              <linearGradient id="litGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#78c6a3" />
                <stop offset="100%" stopColor="#1d6a4a" />
              </linearGradient>
            </defs>
          </svg>

          {/* 环心：点亮数 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-black leading-none tabular-nums text-[#1d6a4a] md:text-[32px]">
              {currentTeam ? selfLit : '—'}
            </span>
            <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-stone-400">
              / {TILE_COUNT} 格
            </span>
          </div>
        </div>

        {/* 烫金铭牌：标题压在环下方，形成「奖牌 + 铭牌」的整体 */}
        <div className="relative mt-2.5 md:mt-3">
          <div className="rounded-md border-2 border-stone-800 bg-gradient-to-b from-[#ffe9a8] via-[#ffd977] to-[#efb845] px-3 py-1.5 shadow-[3px_3px_0_#292524] md:px-4">
            <p className="text-center text-[13px] font-black leading-none tracking-tight text-[#4a3306] md:text-base">
              无限循环读书地狱
            </p>
            <p className="mt-1 text-center text-[8px] font-black uppercase tracking-[0.3em] text-[#8a6a1c]">
              Infinite Reading Hell
            </p>
          </div>
          {/* 左右垂饰：桌游锦旗质感 */}
          <span
            aria-hidden
            className="absolute -left-1.5 top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-2 border-stone-800 bg-[#d9a441]"
          />
          <span
            aria-hidden
            className="absolute -right-1.5 top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-2 border-stone-800 bg-[#d9a441]"
          />
        </div>

        {/* 当前位置 */}
        <p className="mt-2 rounded-full border border-[#c9b98f] bg-[#fffdf4]/85 px-2.5 py-0.5 text-[10px] font-bold text-stone-600 shadow-[1px_1px_0_rgba(41,37,36,0.15)]">
          {currentTeam
            ? `本队在第 ${currentTeam.position} 格 · 第 ${currentTeam.lap} 轮`
            : '观战中 · 未入队'}
        </p>
      </div>
    </div>
  )
}
