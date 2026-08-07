import { cn } from '@/lib/utils'
import { emblemByKey } from '../lib/emblems'

/**
 * 队伍徽章：直接渲染桌面 AI 素材生成的 PNG（public/emblems/{key}.png）。
 * 图片为深色盘面 + 透明背景的正方形，白/灰边已裁除。
 * 队伍尚未选择徽章（emblem 为空）时渲染「待选」占位盘，与真实徽章区分。
 */
export function TeamEmblem({
  emblem,
  size = 40,
  className,
}: {
  emblem?: string | null
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
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.28) }}
      >
        待选
      </span>
    )
  }
  const spec = emblemByKey(emblem)
  return (
    <img
      src={`/emblems/${spec.key}.png`}
      width={size}
      height={size}
      alt={`队伍形象：${spec.name}`}
      title={spec.name}
      className={className}
      draggable={false}
    />
  )
}
