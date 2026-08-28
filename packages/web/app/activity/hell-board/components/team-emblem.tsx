'use client'

import { cn } from '@/lib/utils'
import { emblemOrder } from '../lib/emblems'
import { RainbowCrest } from './rainbow-crest'

/**
 * 队伍徽章：彩虹主视觉 + 队伍主色。
 * 未配置徽章时渲染「待选」占位盘。
 */
export function TeamEmblem({
  emblem,
  accent,
  size = 40,
  className,
}: {
  emblem?: string | null
  /** 队伍主色（回退金色） */
  accent?: string
  size?: number
  className?: string
}) {
  if (!emblem) {
    return (
      <span
        aria-label="尚未选择徽章"
        title="徽章待选"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-stone-400/80 bg-stone-200/80 font-black text-stone-500',
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.24) }}
      >
        待选
      </span>
    )
  }
  return (
    <RainbowCrest
      accent={accent || '#c9a227'}
      order={emblemOrder(emblem)}
      size={size}
      className={className}
    />
  )
}