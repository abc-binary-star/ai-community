'use client'

import { useEffect, useState } from 'react'
import {
  BookOpen,
  Dices,
  Flame,
  Hourglass,
  LifeBuoy,
  Loader2,
  ShieldCheck,
  Star,
  Wrench,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchTimeline } from '../lib/api'
import type { TimelineEvent, TimelineEventType } from '../lib/types'

/** 时间线事件类型 → 展示配置（图标 / 配色 / 名称） */
const EVENT_META: Record<
  TimelineEventType,
  { icon: typeof Star; label: string; iconClass: string }
> = {
  checkin: { icon: BookOpen, label: '打卡', iconClass: 'bg-emerald-100 text-emerald-700' },
  review: { icon: ShieldCheck, label: '审核', iconClass: 'bg-sky-100 text-sky-700' },
  roll: { icon: Dices, label: '掷骰', iconClass: 'bg-violet-100 text-violet-700' },
  lit: { icon: Star, label: '点亮', iconClass: 'bg-amber-100 text-amber-700' },
  judgement: { icon: Flame, label: '判定', iconClass: 'bg-orange-100 text-orange-700' },
  fallback: { icon: LifeBuoy, label: '保底', iconClass: 'bg-teal-100 text-teal-700' },
  timer: { icon: Hourglass, label: '计时', iconClass: 'bg-rose-100 text-rose-700' },
  manual: { icon: Wrench, label: '人工', iconClass: 'bg-stone-200 text-stone-600' },
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 本队时间线（PRD 10.3）：队伍全部动态的留痕视图，
 * 覆盖打卡 / 审核 / 掷骰 / 点亮 / 判定 / 保底 / 计时 / 人工修正，最新在前。
 */
export function TimelineDialog({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchTimeline()
      .then((items) => {
        if (alive) setEvents(items)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '时间线加载失败')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] shadow-[6px_6px_0_#292524] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id="timeline-title" className="text-lg font-black text-stone-900">
              本队时间线
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              队伍全部动态留痕，按时间倒序 · 最近 100 条
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {error ? (
            <p role="alert" className="rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
              {error}
            </p>
          ) : events === null ? (
            <p className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-400">
              <Loader2 className="size-3.5 animate-spin" />正在加载时间线…
            </p>
          ) : events.length === 0 ? (
            <p className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-500">
              暂无动态，队伍的点亮 / 打卡 / 掷骰记录会出现在这里。
            </p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[13px] before:top-1 before:w-px before:bg-stone-300">
              {events.map((ev) => {
                const meta = EVENT_META[ev.type] ?? EVENT_META.manual
                const Icon = meta.icon
                return (
                  <li key={ev.id} className="relative flex items-start gap-3">
                    <span
                      className={cn(
                        'z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#fffdf5] shadow-[0_0_0_1px_rgba(41,37,36,0.15)]',
                        meta.iconClass,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-xs font-bold leading-relaxed text-stone-800">{ev.text}</p>
                      <p className="mt-0.5 text-[10px] font-medium tabular-nums text-stone-400">
                        {meta.label} · {formatTime(ev.createdAt)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
