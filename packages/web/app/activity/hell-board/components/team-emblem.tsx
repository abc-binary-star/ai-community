import { emblemByKey } from '../lib/emblems'

/**
 * 队伍徽章：直接渲染桌面 AI 素材生成的 PNG（public/emblems/{key}.png）。
 * 图片为深色盘面 + 透明背景的正方形，白/灰边已裁除。
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
