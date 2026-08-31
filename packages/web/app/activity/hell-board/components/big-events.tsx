'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, MapPin, PartyPopper, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '../lib/api'
import { EFFECT_TEXT } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { BigEvent, Tile } from '../lib/types'
import { Dice } from './dice'
import { TeamEmblem } from './team-emblem'

const POLL_INTERVAL_MS = 15_000

/** 同一事件永远使用同一句播报，刷新时不会来回变化。 */
const DICE_QUIPS: Record<number, string[]> = {
  1: ['佛系迈出一小步，离冠军又近了一点', '骰子轻轻眨眼：今天先走一步', '稳字当头，小步也算新进度'],
  2: ['轻盈连跳两格，像翻过两页好书', '不急不慢，两格刚好够热身', '双倍脚印已盖章，继续向前'],
  3: ['三步一个小节奏，队伍状态在线', '踩着三拍子向前，稳得很有章法', '中间点数也能走出主角气场'],
  4: ['四平八稳，一路带着书香前进', '四格连走，已经听见对手翻书了', '步步为营，悄悄拉开新距离'],
  5: ['五格加速，书页都被风吹起来了', '快马加鞭，一口气冲出五格', '距离感突然消失，前排请注意'],
  6: ['满点起飞，今天的欧气有点超标！', '六六大顺，直接把进度条踩到底', '天选之骰登场，全岛都听见了'],
}

function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function pick(list: string[], seed: number): string {
  return list[seed % list.length]
}

function tileLabel(index: number): string {
  return index <= 0 ? '起点' : `第 ${index} 格`
}

/** 落地格一句话点评；运营改过格子标题时优先使用标题。 */
function tileTag(event: BigEvent, tile?: Tile): string {
  const result = event.resultSummary?.trim()
  if (result) return result
  if (event.toTile >= 100) return '冠军终点 · 冲线时刻！'
  const name = tile?.title?.trim()
  switch (tile?.kind) {
    case 'forward':
      return name ? `踩中「${name}」，顺风再加速` : '踩中加速带，顺风多跑几格'
    case 'backward':
      return name ? `撞上「${name}」，被迫倒档` : '撞上减速带，倒退几格'
    case 'swap':
      return name ? `「${name}」发动，乾坤大挪移` : '双子格发动，位置大挪移'
    case 'special':
      if (tile.effect && EFFECT_TEXT[tile.effect]) {
        const effect = EFFECT_TEXT[tile.effect]
        return name && name !== '特殊功能' && name !== '特殊功能格' && name !== effect
          ? `触发「${name}」：${effect}`
          : `触发：${effect}`
      }
      return name && name !== '特殊功能' && name !== '特殊功能格'
        ? `触发「${name}」`
        : '触发特殊功能格（该条旧记录没有保留具体效果）'
    default:
      return name ? `落在「${name}」` : '平稳落地，继续积攒彩虹'
  }
}

/** 实际位移与骰子点数的差额点评；互换格不按普通位移解释。 */
function moveNote(event: BigEvent, tile?: Tile): string | null {
  if (tile?.kind === 'swap') return null
  const moved = event.toTile - event.fromTile
  if (moved > event.diceValue) return `格子加持，实际前进 ${moved} 格`
  if (moved === event.diceValue) return null
  if (moved > 0) return `被格子拽住，实际前进 ${moved} 格`
  if (moved === 0) return '原地罚站，骰子这次白忙了'
  return `倒滑 ${-moved} 格，替他们心疼一秒`
}

function timeAgo(value: string): string {
  const time = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(time.getTime())) return value
  const minutes = Math.floor(Math.max(0, Date.now() - time.getTime()) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return `${time.getMonth() + 1}月${time.getDate()}日`
}

function TimelineRow({ event, tile, latest, last }: { event: BigEvent; tile?: Tile; latest: boolean; last: boolean }) {
  const note = event.resultSummary ? null : moveNote(event, tile)
  return (
    <li className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 sm:grid-cols-[78px_26px_minmax(0,1fr)] sm:gap-3">
      <time className="hidden pt-3 text-right text-[10px] font-bold tabular-nums text-stone-400 sm:block" dateTime={event.createdAt}>
        {timeAgo(event.createdAt)}
      </time>

      <div className="relative flex justify-center" aria-hidden>
        {!last && <span className="absolute bottom-[-14px] top-6 w-0.5 bg-[#d8ccb0]" />}
        <span
          className={cn(
            'relative mt-3 flex size-3.5 rounded-full border-[3px] border-[#f7f6ed] ring-2 ring-stone-700',
            latest && 'size-4 animate-pulse ring-amber-700 motion-reduce:animate-none',
          )}
          style={{ backgroundColor: event.teamColor || '#d9a441' }}
        />
      </div>

      <article
        className={cn(
          'relative mb-3 overflow-hidden rounded-xl border-2 border-stone-800 bg-white p-3.5 shadow-[3px_3px_0_#292524] sm:p-4',
          latest && 'bg-gradient-to-br from-[#fff8d8] via-white to-[#f3e9ff] shadow-[4px_4px_0_#292524]',
        )}
      >
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: event.teamColor || '#d6d3d1' }} aria-hidden />
        <div className="flex items-start gap-2.5 pl-1">
          <TeamEmblem emblem={event.teamEmblem} accent={event.teamColor} size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="min-w-0 truncate text-sm font-black text-stone-900">{event.teamName || '神秘队伍'}</p>
              {latest && <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-900">最新</span>}
              <time className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-stone-400 sm:hidden" dateTime={event.createdAt}>
                {timeAgo(event.createdAt)}
              </time>
            </div>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">
              掷出 <span className="text-base font-black text-rose-600">{event.diceValue}</span> 点
            </p>
          </div>
          <Dice value={event.diceValue} size="sm" />
        </div>

        <p className="mt-2 pl-1 text-sm font-black leading-snug text-stone-900">{pick(DICE_QUIPS[event.diceValue] ?? DICE_QUIPS[3], hashId(event.id))}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-1 text-xs font-bold text-stone-600">
          <span className="rounded-md border border-stone-300 bg-[#fffdf5] px-2 py-1 tabular-nums">{tileLabel(event.fromTile)}</span>
          <ArrowRight className="size-3.5 shrink-0 text-amber-700" aria-hidden />
          <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 tabular-nums text-emerald-800">{tileLabel(event.toTile)}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 pl-1 text-[11px] font-medium leading-relaxed text-stone-600">
          <MapPin className="mt-0.5 size-3 shrink-0 text-rose-500" aria-hidden />
          <span>
            {tileTag(event, tile)}
            {note && <span className="text-amber-800"> · {note}</span>}
          </span>
        </p>
      </article>
    </li>
  )
}

/**
 * 最近掷骰大事件。生产环境自行拉取并轮询；视觉预览可传入 events 固定数据。
 * 独立视图使用单列时间线；桌面显示独立时间列，手机把时间收进事件卡片。
 */
export function BigEventsPanel({ events: controlledEvents }: { events?: BigEvent[] }) {
  const tiles = useActivityStore((state) => state.tiles)
  const [events, setEvents] = useState<BigEvent[]>(controlledEvents ?? [])
  const [loading, setLoading] = useState(controlledEvents === undefined)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (initial = false) => {
      if (controlledEvents !== undefined) return
      if (!initial) setReloading(true)
      try {
        setEvents(await api.fetchBigEvents())
        setError(null)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '大事件加载失败')
      } finally {
        setLoading(false)
        setReloading(false)
      }
    },
    [controlledEvents],
  )

  useEffect(() => {
    if (controlledEvents !== undefined) {
      setEvents(controlledEvents)
      setLoading(false)
      return
    }
    void load(true)
    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [controlledEvents, load])

  const latest = events[0]
  const tileByIndex = new Map(tiles.map((tile) => [tile.index, tile]))

  return (
    <section aria-labelledby="big-events-heading" className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-stone-800 pb-3">
        <div>
          <h2 id="big-events-heading" className="flex items-center gap-2 text-lg font-black text-stone-900 sm:text-xl">
            <span className="flex size-9 items-center justify-center rounded-lg border-2 border-stone-800 bg-[#ffd166] shadow-[2px_2px_0_#292524]">
              <PartyPopper className="size-4" aria-hidden />
            </span>
            岛上大事件
            <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">LIVE</span>
          </h2>
          <p className="mt-1 text-xs font-medium text-stone-500">谁手气爆棚、谁被格子背刺，最近战况都在这里</p>
        </div>
        {controlledEvents === undefined && (
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || reloading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 hover:text-amber-700 active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', reloading && 'animate-spin')} aria-hidden />
            刷新战况
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
          战况暂时没有传回来：{error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 pl-8 sm:pl-28" aria-label="正在加载大事件">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-xl border-2 border-stone-200 bg-white/70 motion-reduce:animate-none" />
          ))}
        </div>
      ) : !latest ? (
        <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white/70 px-4 py-16 text-center">
          <PartyPopper className="mx-auto size-7 text-stone-300" aria-hidden />
          <p className="mt-3 text-sm font-black text-stone-700">全岛暂时风平浪静</p>
          <p className="mt-1 text-xs font-medium text-stone-400">等群里第一次掷骰落子，头条马上安排</p>
        </div>
      ) : (
        <ol aria-label="最近掷骰动态">
          {events.map((event, index) => (
            <TimelineRow
              key={event.id}
              event={event}
              tile={tileByIndex.get(event.landedTile || event.toTile)}
              latest={index === 0}
              last={index === events.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
