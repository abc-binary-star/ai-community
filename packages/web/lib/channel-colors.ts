import type { Channel } from 'shared'

/**
 * 频道色彩系统：每个频道一枚专属颜色（Fresh Editorial 主题）。
 * 类名必须是完整的静态字符串，Tailwind 才能正确编译。
 */
export interface ChannelColor {
  /** 侧边栏小圆点 */
  dot: string
  /** 彩色文字 */
  text: string
  /** 彩色胶囊（浅底深字） */
  chip: string
  /** 浅色底（hover / 高亮） */
  soft: string
  /** 彩色描边 */
  border: string
  /** 频道色条 CSS 变量值（hsl 三值），用于 channel-stripe 工具类 */
  stripe: string
}

export const CHANNEL_COLORS: Record<string, ChannelColor> = {
  general: {
    dot: 'bg-channel-general',
    text: 'text-channel-general',
    chip: 'bg-channel-general/10 text-channel-general',
    soft: 'bg-channel-general/5',
    border: 'border-channel-general/30',
    stripe: '199 95% 46%',
  },
  tech: {
    dot: 'bg-channel-tech',
    text: 'text-channel-tech',
    chip: 'bg-channel-tech/10 text-channel-tech',
    soft: 'bg-channel-tech/5',
    border: 'border-channel-tech/30',
    stripe: '243 80% 60%',
  },
  design: {
    dot: 'bg-channel-design',
    text: 'text-channel-design',
    chip: 'bg-channel-design/10 text-channel-design',
    soft: 'bg-channel-design/5',
    border: 'border-channel-design/30',
    stripe: '340 82% 57%',
  },
  gaming: {
    dot: 'bg-channel-gaming',
    text: 'text-channel-gaming',
    chip: 'bg-channel-gaming/10 text-channel-gaming',
    soft: 'bg-channel-gaming/5',
    border: 'border-channel-gaming/30',
    stripe: '38 92% 50%',
  },
  life: {
    dot: 'bg-channel-life',
    text: 'text-channel-life',
    chip: 'bg-channel-life/10 text-channel-life',
    soft: 'bg-channel-life/5',
    border: 'border-channel-life/30',
    stripe: '160 72% 38%',
  },
}

const FALLBACK = CHANNEL_COLORS.general

/** 根据频道 name（或 label）获取颜色配置，未知频道回退到 general */
export function channelColor(name?: string): ChannelColor {
  if (!name) return FALLBACK
  if (CHANNEL_COLORS[name]) return CHANNEL_COLORS[name]
  const lower = name.toLowerCase()
  if (CHANNEL_COLORS[lower]) return CHANNEL_COLORS[lower]
  // 兼容数据库中的中文/自定义 label
  for (const key of Object.keys(CHANNEL_COLORS)) {
    if (name.includes(key)) return CHANNEL_COLORS[key]
  }
  return FALLBACK
}

/** 根据 Channel 对象获取颜色配置 */
export function channelColorOf(channel?: Channel): ChannelColor {
  return channelColor(channel?.name)
}
