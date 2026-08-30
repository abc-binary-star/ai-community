'use client'

import { useMemo } from 'react'
import { BookMarked, Crown, Dices, History, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RAINBOW, RAINBOW_ORDER } from '../lib/board'
import { blockedReason, colorLabel, tileDetailText, tileMeta } from '../lib/rules'
import { useActivityStore, useTile } from '../lib/store'
import type { Team } from '../lib/types'
import { DiceTray } from './dice-tray'
import { TeamEmblem } from './team-emblem'

/**
 * 队伍状态面板：本队当前格子 + buff/debuff + 彩虹进度 + 核心资产 + 操作。
 * 按运营约定只展示「当前格子 + 当前 buff/debuff」，其余为规则核心资产展示。
 */
export function RainbowPanel({
  team,
  isCaptain,
  archived,
  onOpenTimeline,
}: {
  team: Team
  isCaptain: boolean
  archived: boolean
  onOpenTimeline: () => void
}) {
  const tile = useTile(team.position)
  const rolling = useActivityStore((s) => s.rolling)
  const rollDice = useActivityStore((s) => s.rollDice)
  const doUseDice = useActivityStore((s) => s.useUniversalDice)
  const completeCycle = useActivityStore((s) => s.completeCycle)

  const meta = tileMeta(tile)
  const reason = blockedReason(team, isCaptain, archived)
  const memberByColor = useMemo(() => {
    const m = new Map<string, string>()
    team.members.forEach((member) => {
      if (member.color) m.set(member.color, member.name)
    })
    return m
  }, [team.members])

  const progressToDice = Math.min(team.points, 10)
  const statusChip =
    team.status === 'completed'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : team.rollChances > 0
        ? 'bg-sky-100 text-sky-800 border-sky-300'
        : 'bg-violet-100 text-violet-800 border-violet-300'

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      {/* 轮到队长掷骰提示 */}
      {!archived && isCaptain && team.rollChances > 0 && team.status !== 'completed' && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-600 bg-gradient-to-r from-emerald-50 to-emerald-100 px-3 py-2 shadow-[3px_3px_0_#292524] animate-pulse motion-reduce:animate-none">
          <Dices className="size-4 shrink-0 text-emerald-700" />
          <p className="text-[12px] font-black text-emerald-800">轮到你了！群里掷骰后在下方录入点数</p>
        </div>
      )}

      {/* 队头 */}
      <section className="rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f6edd6] p-3 shadow-[3px_3px_0_#292524]">
        <div className="flex items-center gap-2.5">
          <TeamEmblem emblem={team.emblem} accent={team.color} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-black text-stone-900">{team.name}</h2>
              <span className={cn('shrink-0 rounded border px-1 py-px text-[9px] font-black', statusChip)}>
                {team.status === 'completed' ? '🏆 已冲线' : team.rollChances > 0 ? '可掷骰' : '集彩虹中'}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] font-medium text-stone-500">
              当前 {tile ? `第 ${team.position} 格` : '起点（0）'} · 已完成 {team.rainbowCount} 轮彩虹 · 每周保底 {4 + team.weekMinDelta} 条
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenTimeline}
            title="本队时间线"
            className="flex size-8 items-center justify-center rounded-md border-2 border-stone-800 bg-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none"
          >
            <History className="size-3.5" />
          </button>
        </div>

        {/* 核心资产 */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <div className="rounded-md border border-[#dccfa8] bg-white/80 px-2 py-1.5 text-center">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-black text-stone-400"><Sparkles className="size-2.5 text-amber-500" />团队积分</p>
            <p className="mt-0.5 text-base font-black tabular-nums text-amber-700">{team.points}</p>
            <p className="text-[8px] font-medium text-stone-400">{progressToDice}/10 → 万能骰子</p>
          </div>
          <div className="rounded-md border border-[#dccfa8] bg-white/80 px-2 py-1.5 text-center">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-black text-stone-400"><Zap className="size-2.5 fill-violet-400 text-violet-500" />万能骰子</p>
            <p className="mt-0.5 text-base font-black tabular-nums text-violet-700">{team.universalDice}</p>
          </div>
        </div>

        {/* 彩虹 7 色：认领成员 */}
        <div className="mt-2.5">
          <p className="text-[10px] font-black text-[#6b4e15]">本轮彩虹 · 7 色认领</p>
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {RAINBOW_ORDER.map((k) => {
              const name = memberByColor.get(k)
              return (
                <div key={k} className="flex flex-col items-center gap-0.5" title={`${RAINBOW[k].label}色${name ? `：${name}` : '（未认领）'}`}>
                  <span
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-full border-2 border-stone-800 text-[10px] font-black text-white shadow-[1px_1px_0_rgba(41,37,36,0.3)]',
                      name ? '' : 'opacity-40 grayscale',
                    )}
                    style={{ backgroundColor: RAINBOW[k].hex }}
                  >
                    {name ? RAINBOW[k].label : '·'}
                  </span>
                  <span className="w-full truncate text-center text-[9px] font-bold text-stone-600">{name ?? '空'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 当前格子 + buff/debuff */}
      <section className="rounded-lg border-2 border-stone-800 bg-[#fffdf4] p-3 shadow-[3px_3px_0_#292524]">
        <p className="flex items-center gap-1.5 text-[11px] font-black text-[#6b4e15]">
          <BookMarked className="size-3.5 text-emerald-700" />
          当前格子
        </p>
        <div className="mt-2 flex items-start gap-2">
          <span
            className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-stone-800 text-sm font-black shadow-[2px_2px_0_#292524]',
              team.status === 'completed' ? 'bg-amber-400 text-amber-950' : 'bg-stone-800 text-white',
            )}
          >
            {team.position > 0 ? team.position : '起'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black leading-snug text-stone-900">{team.position === 0 ? '还没出发：先集齐一轮彩虹获得掷骰机会' : tile ? tileDetailText(tile) : `第 ${team.position} 格`}</p>
            {team.position > 0 && <p className="mt-0.5 text-[10px] font-medium text-stone-500">{meta.kindLabel}</p>}
          </div>
        </div>

        {/* buff/debuff */}
        {team.buffs.length > 0 && (
          <div className="mt-2.5">
            <p className="text-[10px] font-black text-[#6b4e15]">当前 buff / debuff</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {team.buffs.map((b, i) => (
                <span
                  key={`${b.kind}-${i}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                  title={b.label}
                >
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="truncate">{b.label}</span>
                  {b.uses > 0 && <span className="rounded bg-amber-200 px-1 text-[9px] font-black">×{b.uses}</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 操作：队长可见 */}
      {!archived && isCaptain && (
        <section className="space-y-2">
          <button
            type="button"
            disabled={rolling || team.status === 'completed'}
            onClick={() => void completeCycle()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fff1c2] to-[#ffd166] px-3 py-2.5 text-[12px] font-black text-[#4a3306] shadow-[3px_3px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            本轮彩虹集齐，登记 +1 掷骰机会
          </button>
          <DiceTray
            canRoll={team.status !== 'completed' && team.rollChances > 0}
            canUniversal={team.status !== 'completed' && team.universalDice > 0}
            disabled={rolling}
            onSubmit={(v) => void rollDice(v)}
            onUniversal={(v) => void doUseDice(v)}
            hint="群里掷几点就点哪个"
          />
          {reason && !isCaptain && team.status !== 'completed' && (
            <p className="rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/70 px-2.5 py-2 text-[10px] font-medium text-stone-500">
              {reason}（请队长操作）
            </p>
          )}
        </section>
      )}

      {/* 观战/非队长提示 */}
      {!archived && !isCaptain && team.status !== 'completed' && (
        <p className="flex items-center gap-1 rounded-md border border-[#dccfa8] bg-[#f9f3e2]/70 px-2.5 py-2 text-[10px] font-medium text-stone-500">
          <Crown className="size-3 shrink-0 text-amber-600" />
          掷骰由队长录入：群内掷出的点数请告诉队长
        </p>
      )}
    </div>
  )
}