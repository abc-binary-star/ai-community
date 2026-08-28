'use client'

import { useState } from 'react'
import { Dices, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/** 骰子面 */
function DiceFace({ value, selected, onPick }: { value: number; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`骰子 ${value} 点`}
      className={cn(
        'grid size-9 grid-cols-3 grid-rows-3 gap-0.5 rounded-md border-2 p-1 transition-all',
        selected
          ? 'border-amber-700 bg-[#ffd166] shadow-[2px_2px_0_#292524] -translate-y-0.5'
          : 'border-stone-800 bg-[#fffdf5] hover:-translate-y-0.5',
        'active:translate-x-px active:translate-y-px active:shadow-none',
      )}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={cn('rounded-full', PIPS[value]?.includes(i) ? 'bg-[#e85d4f]' : 'bg-transparent')}
        />
      ))}
    </button>
  )
}

/**
 * 骰子录入面板：群里掷出几点就点哪个面。
 * 普通掷骰消耗 1 次掷骰机会；万能骰子无视格子效果且不占机会。
 * 选中点数后需二次确认，防止误触。
 */
export function DiceTray({
  canRoll,
  canUniversal,
  disabled,
  onSubmit,
  onUniversal,
  hint,
}: {
  canRoll: boolean
  canUniversal: boolean
  disabled: boolean
  onSubmit: (value: number) => void
  onUniversal: (value: number) => void
  hint?: string
}) {
  const [value, setValue] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<null | 'roll' | 'universal'>(null)

  const reset = () => {
    setValue(null)
    setConfirming(null)
  }

  const handleSubmit = () => {
    if (!value) return
    if (confirming === 'roll') {
      onSubmit(value)
      reset()
    } else {
      setConfirming('roll')
    }
  }

  const handleUniversal = () => {
    if (!value) return
    if (confirming === 'universal') {
      onUniversal(value)
      reset()
    } else {
      setConfirming('universal')
    }
  }

  return (
    <div className="rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f6edd6] p-3 shadow-[3px_3px_0_#292524]">
      <p className="flex items-center gap-1.5 text-[11px] font-black text-[#6b4e15]">
        <Dices className="size-3.5 text-amber-700" />
        录入骰子点数
        <span className="ml-auto font-medium normal-case text-stone-500">{hint}</span>
      </p>

      {!canRoll && !canUniversal ? (
        <p className="mt-2.5 rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/70 px-2.5 py-2 text-[11px] font-medium leading-relaxed text-stone-500">
          在群里读完打卡并集齐一轮彩虹后，即可获得掷骰机会；积分每满 10 分自动兑换万能骰子。
        </p>
      ) : (
        <>
          <div className="mt-2.5 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((v) => (
              <DiceFace
                key={v}
                value={v}
                selected={value === v}
                onPick={() => {
                  setValue(v)
                  setConfirming(null)
                }}
              />
            ))}
          </div>

          {confirming && value && (
            <div className="mt-2 rounded-md border-2 border-amber-400 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-800">
              {confirming === 'roll'
                ? `确认掷出 ${value} 点？队伍将前进并结算格子效果`
                : `确认使用万能骰子掷出 ${value} 点？无视格子效果`}
              <button
                type="button"
                onClick={reset}
                className="ml-2 text-amber-600 underline hover:text-amber-800"
              >
                取消
              </button>
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              disabled={!canRoll || !value || disabled}
              onClick={handleSubmit}
              className={cn(
                'flex-1 rounded-md border-2 border-stone-800 px-2 py-1.5 text-[11px] font-black text-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:bg-stone-300 disabled:hover:translate-y-0',
                confirming === 'roll' ? 'bg-amber-600' : 'bg-[#22c55e]',
              )}
            >
              {disabled ? (
                <Loader2 className="mx-auto size-3.5 animate-spin" />
              ) : !value ? (
                '先选点数'
              ) : confirming === 'roll' ? (
                `确认掷出 ${value} 点`
              ) : (
                `掷骰前进 ${value} 格`
              )}
            </button>
            <button
              type="button"
              disabled={!canUniversal || !value || disabled}
              onClick={handleUniversal}
              title="万能骰子：无视当前格子效果，不消耗掷骰机会"
              className={cn(
                'rounded-md border-2 border-stone-800 px-2 py-1.5 text-[11px] font-black text-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:bg-stone-300 disabled:hover:translate-y-0',
                confirming === 'universal' ? 'bg-violet-700' : 'bg-[#8b5cf6]',
              )}
            >
              {disabled ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : confirming === 'universal' ? '确认' : '万能骰子'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
