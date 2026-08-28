'use client'

import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActivityStore } from '../lib/store'
import { Dialog, DialogCloseButton } from './dialog'

const TYPE_META: Record<string, { label: string; cls: string }> = {
  roll: { label: '掷骰', cls: 'bg-sky-100 text-sky-800' },
  dice: { label: '万能骰子', cls: 'bg-violet-100 text-violet-800' },
  cycle: { label: '彩虹集齐', cls: 'bg-rose-100 text-rose-700' },
  tile: { label: '格效', cls: 'bg-amber-100 text-amber-800' },
  win: { label: '冲线', cls: 'bg-amber-200 text-amber-900' },
  color: { label: '颜色', cls: 'bg-emerald-100 text-emerald-800' },
  manual: { label: '运营修正', cls: 'bg-stone-200 text-stone-700' },
}

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'roll', label: '掷骰' },
  { key: 'tile', label: '格效' },
  { key: 'cycle', label: '彩虹' },
  { key: 'dice', label: '道具' },
] as const

/** 本队时间线：掷骰 / 格子效果 / 彩虹 / 道具等留痕，支持类型筛选 */
export function TimelineDialog({ onClose }: { onClose: () => void }) {
  const timeline = useActivityStore((s) => s.timeline)
  const [filter, setFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return timeline
    if (filter === 'dice') return timeline.filter((e) => e.type === 'dice' || e.type === 'manual')
    return timeline.filter((e) => e.type === filter)
  }, [timeline, filter])

  return (
    <Dialog open onClose={onClose} className="max-w-md" labelledBy="timeline-title">
      <div className="flex items-center gap-2 border-b-2 border-stone-800 px-4 py-3">
        <History className="size-4 text-amber-700" />
        <p id="timeline-title" className="text-sm font-black text-stone-900">本队时间线</p>
        <DialogCloseButton onClose={onClose} />
      </div>

      {/* 类型筛选 */}
      <div className="flex gap-1 border-b border-[#e5d9b8] px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-black transition-colors',
              filter === f.key
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ maxHeight: '55dvh' }}>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-stone-500">
            {timeline.length === 0
              ? '还没有记录：集齐一轮彩虹开始掷骰后，这里会滚动更新'
              : '当前筛选下暂无记录'}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((e) => {
              const meta = TYPE_META[e.type] ?? { label: '事件', cls: 'bg-stone-100 text-stone-500' }
              return (
                <li key={e.id} className="flex gap-2">
                  <span className={cn('mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black', meta.cls)}>{meta.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium leading-snug text-stone-700">{e.text}</p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-stone-400">{e.createdAt}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
