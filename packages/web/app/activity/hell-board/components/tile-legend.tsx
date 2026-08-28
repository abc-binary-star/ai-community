'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KIND_META } from '../lib/board'

const TILE_ORDER = ['forward', 'backward', 'special', 'swap', 'blank'] as const

const TILE_COLORS: Record<string, string> = {
  forward: 'from-[#eefbea] to-[#a9d9a6] border-[#4e8d58]',
  backward: 'from-[#fff0eb] to-[#efaaa0] border-[#ad5651]',
  special: 'from-[#fff8d6] to-[#efca64] border-[#ad7d2e]',
  swap: 'from-[#ecfaff] to-[#9fd4df] border-[#4f8899]',
  blank: 'from-[#fffdf7] to-[#ddd2bd] border-[#887763]',
}

/** 地图角落的格子类型图例，可折叠 */
export function TileLegend() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      data-map-control
      className="absolute right-3 top-3 z-40 w-[120px] rounded-xl border border-white/60 bg-[#fffaf0]/90 shadow-[0_6px_18px_rgba(63,52,43,0.16)] backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1 px-2.5 py-1.5 text-left"
        aria-expanded={expanded}
      >
        <Sparkles className="size-3 shrink-0 text-amber-600" />
        <span className="text-[10px] font-black text-[#4d4036]">图例</span>
        {expanded ? (
          <ChevronUp className="ml-auto size-3 text-[#79685a]" />
        ) : (
          <ChevronDown className="ml-auto size-3 text-[#79685a]" />
        )}
      </button>
      {expanded && (
        <div className="space-y-1 border-t border-[#e5d9b8] px-2.5 py-2">
          {TILE_ORDER.map((kind) => {
            const meta = KIND_META[kind]
            return (
              <div key={kind} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex size-4 shrink-0 items-center justify-center rounded border bg-gradient-to-b text-[7px] font-black text-[#4d4035]',
                    TILE_COLORS[kind],
                  )}
                >
                  {meta.short}
                </span>
                <span className="text-[9px] font-bold text-[#5d4e42]">{meta.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
