'use client'

import { CheckCircle2, Dices, Flame, FileText, Hourglass, ScrollText, Star } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import type { TimelineEvent, TimelineEventType } from '../lib/types'

const ICON: Record<TimelineEventType, typeof Star> = {
  checkin: FileText,
  review: CheckCircle2,
  roll: Dices,
  lit: Star,
  judgement: Dices,
  fallback: Flame,
  timer: Hourglass,
}

const TONE: Record<TimelineEventType, string> = {
  checkin: 'text-sky-700',
  review: 'text-emerald-700',
  roll: 'text-amber-700',
  lit: 'text-amber-700',
  judgement: 'text-violet-700',
  fallback: 'text-orange-700',
  timer: 'text-rose-700',
}

/**
 * 队伍时间线（PRD 10.3 / 验收标准 3）：
 * 记录提交、审核结论、掷骰、点亮、判定、保底完成、计时惩罚，是活动过程的可追溯视图。
 */
export function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  return (
    <section aria-labelledby="timeline-heading" className="rounded-lg border-2 border-stone-800 bg-white p-4 shadow-[4px_4px_0_#292524]">
      <h2 id="timeline-heading" className="flex items-center gap-1.5 text-sm font-black text-stone-900">
        <ScrollText aria-hidden className="size-4 text-stone-500" />
        队伍时间线
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-stone-400">暂无事件。</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {events.slice(0, 12).map((event) => {
            const Icon = ICON[event.type]
            return (
              <li key={event.id} className="flex gap-2.5">
                <Icon aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${TONE[event.type]}`} />
                <div className="min-w-0">
                  <p className="text-xs leading-relaxed text-stone-700">{event.text}</p>
                  <p className="mt-0.5 text-[11px] text-stone-400">{formatRelativeTime(event.createdAt)}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
