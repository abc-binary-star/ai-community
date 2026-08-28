import type { RainbowColor, TileKind } from './types'

/** 棋盘总格数 1–100 */
export const TILE_COUNT = 100

/** 五类格子的视觉规范：色系 + 图标 + 短标签 */
export const KIND_META: Record<
  TileKind,
  { label: string; short: string; chip: string; cell: string; icon: 'up' | 'down' | 'swap' | 'star' | 'dot' }
> = {
  forward: {
    label: '前进格',
    short: '进',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    cell: 'from-emerald-50 to-emerald-100/80 border-emerald-300/70 hover:border-emerald-500',
    icon: 'up',
  },
  backward: {
    label: '后退格',
    short: '退',
    chip: 'bg-rose-100 text-rose-800 border-rose-300',
    cell: 'from-rose-50 to-rose-100/80 border-rose-300/70 hover:border-rose-500',
    icon: 'down',
  },
  special: {
    label: '特殊功能格',
    short: '特',
    chip: 'bg-amber-100 text-amber-800 border-amber-300',
    cell: 'from-amber-50 to-amber-100/80 border-amber-400/60 hover:border-amber-500',
    icon: 'star',
  },
  swap: {
    label: '位置互换格',
    short: '换',
    chip: 'bg-sky-100 text-sky-800 border-sky-300',
    cell: 'from-sky-50 to-sky-100/80 border-sky-300/70 hover:border-sky-500',
    icon: 'swap',
  },
  blank: {
    label: '空白格',
    short: '空',
    chip: 'bg-stone-100 text-stone-500 border-stone-300',
    cell: 'from-stone-50 to-stone-100/60 border-stone-300/60 hover:border-stone-400',
    icon: 'dot',
  },
}

/** 七彩虹色表：key → 中文名 / 主色 / 浅底 */
export const RAINBOW: Record<RainbowColor, { label: string; hex: string; dot: string; chip: string }> = {
  red: { label: '红', hex: '#e11d48', dot: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700' },
  orange: { label: '橙', hex: '#f97316', dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-700' },
  yellow: { label: '黄', hex: '#eab308', dot: 'bg-yellow-400', chip: 'bg-yellow-100 text-yellow-700' },
  green: { label: '绿', hex: '#22c55e', dot: 'bg-green-500', chip: 'bg-green-100 text-green-700' },
  cyan: { label: '青', hex: '#06b6d4', dot: 'bg-cyan-500', chip: 'bg-cyan-100 text-cyan-700' },
  blue: { label: '蓝', hex: '#3b82f6', dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700' },
  purple: { label: '紫', hex: '#8b5cf6', dot: 'bg-violet-500', chip: 'bg-violet-100 text-violet-700' },
}

export const RAINBOW_ORDER: RainbowColor[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']

/** 终点格特殊名 */
export function isFinish(index: number): boolean {
  return index === 100
}

/** 起点格 */
export function isStart(index: number): boolean {
  return index === 1
}

/** 移动 clamp 到 0–100 格（0 = 未出发，100 = 终点） */
export function clampPosition(p: number): number {
  return Math.max(0, Math.min(TILE_COUNT, p))
}
