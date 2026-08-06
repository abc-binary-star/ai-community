'use client'

import { cn } from '@/lib/utils'

/** 通用进度条，任务进度与保底进度共用（PRD 7.3 要求两条进度并列展示） */
export function ProgressBar({
  label,
  valueText,
  ratio,
  tone = 'sky',
  hint,
}: {
  label: string
  valueText: string
  /** 0–1 */
  ratio: number
  tone?: 'sky' | 'amber'
  hint?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)))
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-stone-600">{label}</span>
        <span className="text-xs font-black text-stone-900">{valueText}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={valueText}
        className="mt-1.5 h-3 overflow-hidden rounded-full border border-stone-800 bg-stone-100"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
            tone === 'sky' ? 'bg-[#58b991]' : 'bg-[#ffd166]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{hint}</p>}
    </div>
  )
}
