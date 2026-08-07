'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, PartyPopper, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchFeed } from '../lib/api'
import { formatWords } from '../lib/rules'
import type { FeedItem, TimelineEventType } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/**
 * 事件类型 → 播报风格：颜文字、标签、吐槽前缀。
 * 大事件流是给群友看的热闹版时间线，文案刻意夸张，与严肃的本队时间线区分。
 */
const FEED_META: Record<
  TimelineEventType,
  { emoji: string; tag: string; chip: string; quip: string }
> = {
  checkin: {
    emoji: '📚',
    tag: '#又读完了',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    quip: '书页在燃烧',
  },
  review: {
    emoji: '⚖️',
    tag: '#审判时刻',
    chip: 'bg-sky-100 text-sky-800 border-sky-300',
    quip: '法槌已落下',
  },
  roll: {
    emoji: '🎲',
    tag: '#听天由命',
    chip: 'bg-violet-100 text-violet-800 border-violet-300',
    quip: '命运开始摇晃',
  },
  lit: {
    emoji: '✨',
    tag: '#格子亮了',
    chip: 'bg-amber-100 text-amber-800 border-amber-300',
    quip: '又亮一格，爽',
  },
  judgement: {
    emoji: '🔥',
    tag: '#全员开摇',
    chip: 'bg-orange-100 text-orange-800 border-orange-300',
    quip: '气氛突然凝重',
  },
  fallback: {
    emoji: '🛟',
    tag: '#保底真香',
    chip: 'bg-teal-100 text-teal-800 border-teal-300',
    quip: '量变引起质变',
  },
  timer: {
    emoji: '⏳',
    tag: '#小黑屋',
    chip: 'bg-rose-100 text-rose-800 border-rose-300',
    quip: '正在原地思考人生',
  },
  manual: {
    emoji: '🔧',
    tag: '#人工干预',
    chip: 'bg-stone-200 text-stone-700 border-stone-400',
    quip: '有人动了手脚',
  },
}

/** 打卡本数 → 夸张吹捧语，本数越多越离谱 */
const BOOK_HYPE: Array<[number, string]> = [
  [10, '这不是读书，这是拆书流水线 🏭'],
  [6, '书架已经开始求饶 🙏'],
  [4, '手速惊人，眼睛还好吗 👀'],
  [2, '稳扎稳打，节奏很顶 🎯'],
  [1, '开张了，先吃一本 🍽️'],
]

function bookHype(n: number): string {
  return BOOK_HYPE.find(([min]) => n >= min)?.[1] ?? ''
}

/** 相对时间，刚发生的用「刚刚」，让大事件流有直播感 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(t)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`
}

/** 单条大事件卡片 */
function FeedRow({ item }: { item: FeedItem }) {
  const meta = FEED_META[item.type] ?? FEED_META.manual
  const isCheckIn = item.kind === 'checkin'

  return (
    <li
      className={cn(
        'relative rounded-lg border-2 border-stone-800 bg-white p-3 shadow-[3px_3px_0_#292524] transition-transform hover:-translate-y-0.5',
        item.ownTeam && 'bg-[#fffdf0] ring-2 ring-[#d9a441]/50',
      )}
    >
      {/* 队伍标识条：用队伍配色，快速区分是谁在搞事 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5 rounded-l-md"
        style={{ backgroundColor: item.teamColor || '#d6d3d1' }}
      />

      <div className="flex items-start gap-2.5 pl-2">
        <span className="shrink-0 pt-0.5 text-xl leading-none" aria-hidden>
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TeamEmblem emblem={item.teamEmblem} size={18} className="shrink-0" />
            <span className="text-xs font-black text-stone-900">{item.teamName}</span>
            {item.ownTeam && (
              <span className="rounded bg-[#ffd166] px-1 py-px text-[9px] font-black text-stone-900">
                ★ 本队
              </span>
            )}
            <span className={cn('rounded border px-1.5 py-px text-[9px] font-black', meta.chip)}>
              {meta.tag}
            </span>
            <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-stone-400">
              {relativeTime(item.createdAt)}
            </span>
          </div>

          {isCheckIn ? (
            <>
              <p className="mt-1.5 text-xs font-bold leading-relaxed text-stone-800">
                <span className="text-emerald-800">{item.memberName || '神秘书友'}</span>
                {' 在 '}
                <span className="rounded bg-stone-800 px-1 py-px font-black text-white">
                  第 {item.tileIndex} 格
                </span>
                {' 丢下了 '}
                <span className="text-amber-800">{item.bookCount} 本书</span>
                {typeof item.wordCount === 'number' && item.wordCount > 0 && (
                  <span className="text-stone-500">
                    {' · '}
                    {formatWords(item.wordCount)}
                  </span>
                )}
              </p>
              {item.bookTitles && item.bookTitles.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {item.bookTitles.map((title, i) => (
                    <li
                      key={`${item.id}-${i}`}
                      className="max-w-full truncate rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
                    >
                      《{title}》
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[10px] font-medium italic text-stone-400">
                  书单已加密 🔒 别队的秘密武器，看不得
                </p>
              )}
              {bookHype(item.bookCount ?? 0) && (
                <p className="mt-1.5 text-[10px] font-bold text-stone-500">
                  {bookHype(item.bookCount ?? 0)}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1.5 text-xs font-bold leading-relaxed text-stone-800">{item.text}</p>
              <p className="mt-1 text-[10px] font-bold italic text-stone-400">— {meta.quip}</p>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/** 过滤器：全部 / 只看打卡 / 只看事件 / 只看本队 */
const FILTERS = [
  ['all', '🌍 全场'],
  ['checkin', '📚 只看打卡'],
  ['event', '🎬 只看事件'],
  ['mine', '★ 只看本队'],
] as const

type Filter = (typeof FILTERS)[number][0]

/**
 * 活动大事件（顶部导航独立整页视图）：
 * 全员打卡 + 全场事件的合并直播流，播报口吻刻意夸张，配符号标签便于扫读。
 * 书单仅本队可见，其他队伍只展示数量（与格子详情的可见性口径一致）。
 */
export function ActivityFeedPanel() {
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [reloading, setReloading] = useState(false)

  const load = useCallback(async () => {
    setReloading(true)
    try {
      setItems(await fetchFeed())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '大事件流加载失败')
    } finally {
      setReloading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    const list = items ?? []
    if (filter === 'checkin') return list.filter((i) => i.kind === 'checkin')
    if (filter === 'event') return list.filter((i) => i.kind === 'event')
    if (filter === 'mine') return list.filter((i) => i.ownTeam)
    return list
  }, [items, filter])

  // 顶部战况小结：总打卡数与总字数，给流一个「热度」概念
  const stats = useMemo(() => {
    const list = items ?? []
    const checkIns = list.filter((i) => i.kind === 'checkin')
    return {
      checkIns: checkIns.length,
      books: checkIns.reduce((sum, i) => sum + (i.bookCount ?? 0), 0),
      words: checkIns.reduce((sum, i) => sum + (i.wordCount ?? 0), 0),
    }
  }, [items])

  return (
    <section
      aria-labelledby="feed-heading"
      className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f4edda] p-4 shadow-[4px_4px_0_#292524]"
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="feed-heading" className="flex items-center gap-2 text-base font-black text-stone-900">
            <PartyPopper className="size-4 text-amber-600" />
            活动大事件
            <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[9px] font-black text-white">
              LIVE
            </span>
          </h2>
          <p className="mt-1 text-[11px] font-medium text-stone-500">
            全场打卡与骚动实况 · 最新在前 · 手慢无 🍿
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={reloading}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-2.5 text-[11px] font-bold shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-60"
        >
          <RefreshCw className={cn('size-3.5', reloading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {/* 战况小结 */}
      <dl className="mt-3 grid shrink-0 grid-cols-3 gap-2">
        {[
          ['🔥 打卡次数', `${stats.checkIns} 次`],
          ['📖 书目总数', `${stats.books} 本`],
          ['⚡ 字数总量', formatWords(stats.words)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border-2 border-[#dccfa8] bg-white/70 px-2 py-1.5 text-center"
          >
            <dt className="text-[9px] font-bold text-stone-500">{label}</dt>
            <dd className="text-xs font-black tabular-nums text-stone-900">{value}</dd>
          </div>
        ))}
      </dl>

      {/* 过滤器 */}
      <div
        role="tablist"
        aria-label="大事件过滤"
        className="mt-3 grid shrink-0 grid-cols-4 gap-1 rounded-md border-2 border-stone-800 bg-white p-1"
      >
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'truncate rounded px-1 py-1.5 text-[10px] font-bold transition-colors sm:text-[11px]',
              filter === key
                ? 'bg-[#ffd166] text-stone-900'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {error ? (
          <p role="alert" className="rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
            {error}
          </p>
        ) : items === null ? (
          <p className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-400">
            <Loader2 className="size-3.5 animate-spin" />正在收集现场八卦…
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-stone-300 bg-white/60 px-3 py-6 text-center text-xs font-bold text-stone-500">
            这里空得能听见回声 🌵
            <br />
            <span className="text-[11px] font-medium text-stone-400">
              等第一个人打卡，热闹就开场了
            </span>
          </p>
        ) : (
          <ol className="space-y-2.5">
            {shown.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
