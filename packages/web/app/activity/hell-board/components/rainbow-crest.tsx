'use client'

import { cn } from '@/lib/utils'

/**
 * 队伍徽章：单一纯色盘面（队伍主色）+ 白色序号 + 高光。
 * 红橙黄绿蓝紫六队各一纯色，去掉七色虹弧，强调队伍专属色。
 */
export function RainbowCrest({
  accent = '#c9a227',
  order = 0,
  size = 40,
  className,
}: {
  /** 队伍主色（纯色盘面） */
  accent?: string
  /** 徽章序号，盘心显示 */
  order?: number
  size?: number
  className?: string
}) {
  const darker = `color-mix(in_srgb, ${accent}, black 26%)`
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="队伍徽章"
      className={cn('drop-shadow-sm', className)}
    >
      {/* 外圈描边 */}
      <circle cx="32" cy="32" r="30" fill={darker} stroke="#292524" strokeWidth="2.5" />
      {/* 纯色盘面（径向渐变营造立体感） */}
      <circle
        cx="32"
        cy="32"
        r="26"
        fill={`url(#crest-grad-${order})`}
        stroke={`color-mix(in_srgb, ${accent}, white 55%)`}
        strokeWidth="2"
      />
      <defs>
        <radialGradient id={`crest-grad-${order}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={`color-mix(in_srgb, ${accent}, white 45%)`} />
          <stop offset="55%" stopColor={accent} />
          <stop offset="100%" stopColor={darker} />
        </radialGradient>
      </defs>
      {/* 顶部高光 */}
      <ellipse cx="32" cy="18" rx="13" ry="6" fill="#ffffff" opacity="0.35" />
      {/* 盘心序号 */}
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontSize={order >= 10 ? 15 : 18}
        fontWeight="900"
        fill="#ffffff"
        stroke="#292524"
        strokeWidth="0.8"
        style={{ paintOrder: 'stroke' }}
      >
        {order > 0 ? order : '★'}
      </text>
    </svg>
  )
}
