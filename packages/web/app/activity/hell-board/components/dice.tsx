'use client'

import { cn } from '@/lib/utils'

// 骰子点位坐标（3×3 网格索引），结果由服务端下发，前端仅做表现（PRD 10.3）
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function Dice({
  value,
  rolling = false,
  size = 'md',
}: {
  value: number | null
  rolling?: boolean
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'size-8' : 'size-12'
  return (
    <span
      role="img"
      aria-label={value ? `骰子 ${value} 点` : '骰子待掷'}
      className={cn(
        'inline-grid rotate-2 grid-cols-3 grid-rows-3 gap-0.5 rounded-md border-2 border-stone-900 bg-[#fffdf5] p-1 shadow-[3px_3px_0_#292524]',
        box,
        // 掷骰动画尊重减少动效偏好（PRD 10.2）
        rolling && 'animate-bounce motion-reduce:animate-none',
      )}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'rounded-full',
            value && PIPS[value]?.includes(i) ? 'bg-[#e85d4f]' : 'bg-transparent',
          )}
        />
      ))}
    </span>
  )
}
