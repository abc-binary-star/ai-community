import type { SpecialRule, SpecialRuleKind, Tile } from './types'

/** 环形棋盘固定 20 格 */
export const TILE_COUNT = 20

/** 全局保底阈值：全队累计通过审核 40 本即保底点亮当前格（P1-5） */
export const FALLBACK_THRESHOLD = 40

/** 计时惩罚格编号与时长（P1-6） */
export const PENALTY_TILE_INDEX = 8
export const PENALTY_HOURS = 72

export const RULES: Record<SpecialRuleKind, SpecialRule> = {
  'all-odd': { kind: 'all-odd', label: '全员都投出奇数时可以前进' },
  'all-even': { kind: 'all-even', label: '全员都投出偶数时可以前进' },
  'all-below-4': { kind: 'all-below-4', label: '全员点数低于 4 点（每人 ≤ 3）时可以前进' },
  'all-above-3': { kind: 'all-above-3', label: '全员点数超过 3 点（每人 ≥ 4）时可以前进' },
}

/** 20 格清单，来自 PRD 第 6 节「棋盘格子清单」 */
export const TILES: Tile[] = [
  { index: 1, title: '看十本标题为四个字的书', taskType: 'title-length', target: 10, unit: '本' },
  { index: 2, title: '看八本标题为三个字的书', taskType: 'title-length', target: 8, unit: '本' },
  { index: 3, title: '看十二本封面为红色的书', taskType: 'cover-color', target: 12, unit: '本' },
  {
    index: 4,
    title: '看六本封面为绿色的书',
    taskType: 'cover-color',
    target: 6,
    unit: '本',
    specialRule: RULES['all-odd'],
  },
  { index: 5, title: '看十本推理小说', taskType: 'genre', target: 10, unit: '本' },
  { index: 6, title: '看十三本作者为中国人的书', taskType: 'author-nationality', target: 13, unit: '本' },
  { index: 7, title: '看十本同一个作者的书', taskType: 'same-author', target: 10, unit: '本' },
  { index: 8, title: '三天不打卡', taskType: 'timed-penalty', target: PENALTY_HOURS, unit: '小时' },
  {
    index: 9,
    title: '累计看 100w 字',
    taskType: 'total-words',
    target: 1_000_000,
    unit: '字',
    specialRule: RULES['all-below-4'],
  },
  { index: 10, title: '看十三本书', taskType: 'plain-count', target: 13, unit: '本' },
  { index: 11, title: '看八本标题为两个字的书', taskType: 'title-length', target: 8, unit: '本' },
  { index: 12, title: '看十二本封面为紫色的书', taskType: 'cover-color', target: 12, unit: '本' },
  {
    index: 13,
    title: '看七本亚洲文学',
    taskType: 'genre',
    target: 7,
    unit: '本',
    specialRule: RULES['all-even'],
  },
  { index: 14, title: '看三本历史类书籍', taskType: 'genre', target: 3, unit: '本' },
  { index: 15, title: '看九本封面为蓝色的书', taskType: 'cover-color', target: 9, unit: '本' },
  { index: 16, title: '看十四本标题为五个字的书', taskType: 'title-length', target: 14, unit: '本' },
  {
    index: 17,
    title: '看七本书',
    taskType: 'plain-count',
    target: 7,
    unit: '本',
    specialRule: RULES['all-above-3'],
  },
  { index: 18, title: '看五本封面主色调有两种颜色的书', taskType: 'cover-color', target: 5, unit: '本' },
  // 目标以分钟存储（20 小时 = 1200 分钟），展示层由 formatProgressValue 换算回小时
  { index: 19, title: '持续看书累计 20 小时', taskType: 'total-duration', target: 1200, unit: '分钟' },
  { index: 20, title: '看十二本群友本月打卡过的书', taskType: 'group-cross', target: 12, unit: '本' },
]

export function getTile(index: number): Tile {
  const tile = TILES[index - 1]
  if (!tile) throw new Error(`tile ${index} not found`)
  return tile
}

/** 任务类型的简短标签，用于格子角标 */
export const TASK_TYPE_LABEL: Record<Tile['taskType'], string> = {
  'title-length': '书名字数',
  'cover-color': '封面颜色',
  genre: '题材分类',
  'author-nationality': '作者国籍',
  'same-author': '同一作者',
  'plain-count': '纯数量',
  'total-words': '累计字数',
  'total-duration': '累计时长',
  'group-cross': '群内交叉',
  'timed-penalty': '计时惩罚',
}

/**
 * 矩形环布局：cols × rows 网格的外圈格数为 2(cols-1) + 2(rows-1)，
 * 因此 7×5（桌面，上 6 / 右 4 / 下 6 / 左 4）与 4×8（手机竖屏，上 3 / 右 7 / 下 3 / 左 7）
 * 的外圈都恰好 20 格（PRD 10.2）。
 *
 * 桌面用宽扁形状；手机竖屏若沿用 7 列，单格会被压到 44px 导致文字不可读，
 * 故改用 4 列高瘦形状，单格约 78px 保持可读，同时保留环形语义。
 */
export const BOARD_COLS = 7
export const BOARD_ROWS = 5

/** 手机竖屏形状：4 列 × 8 行，外圈同为 20 格 */
export const BOARD_COLS_SM = 4
export const BOARD_ROWS_SM = 8

export interface TileCell {
  /** CSS grid 列，1-based */
  col: number
  /** CSS grid 行，1-based */
  row: number
}

/**
 * 通用矩形环坐标：1 号格在左上角，顺时针推进。
 * 四条边分别贡献 cols-1 / rows-1 / cols-1 / rows-1 格，各边不含终点角以免重复。
 */
function ringCell(index: number, cols: number, rows: number): TileCell {
  const i = index - 1
  const top = cols - 1
  const right = top + (rows - 1)
  const bottom = right + (cols - 1)
  // 上边：col 1→cols-1，row 1
  if (i < top) return { col: i + 1, row: 1 }
  // 右边：col cols，row 1→rows-1
  if (i < right) return { col: cols, row: i - top + 1 }
  // 下边：col cols→2，row rows
  if (i < bottom) return { col: cols - (i - right), row: rows }
  // 左边：col 1，row rows→2
  return { col: 1, row: rows - (i - bottom) }
}

/** 格子编号 → 桌面 7×5 网格坐标 */
export function tileCell(index: number): TileCell {
  return ringCell(index, BOARD_COLS, BOARD_ROWS)
}

/** 格子编号 → 手机竖屏 4×8 网格坐标 */
export function tileCellSm(index: number): TileCell {
  return ringCell(index, BOARD_COLS_SM, BOARD_ROWS_SM)
}

/** 环形前进：从 from 走 steps 步后的落点（1-based，跨过 20 回到 1） */
export function advance(from: number, steps: number): number {
  return ((from - 1 + steps) % TILE_COUNT) + 1
}

/** 前进是否跨过第 20 格回到第 1 格，用于轮次累加 */
export function crossesStart(from: number, steps: number): boolean {
  return from - 1 + steps >= TILE_COUNT
}

/** 判定单个点数是否满足规则 */
export function matchesRule(kind: SpecialRuleKind, value: number): boolean {
  switch (kind) {
    case 'all-odd':
      return value % 2 === 1
    case 'all-even':
      return value % 2 === 0
    case 'all-below-4':
      return value <= 3
    case 'all-above-3':
      return value >= 4
  }
}
