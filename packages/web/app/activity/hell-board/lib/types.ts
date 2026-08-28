// 活动「九月彩虹桥 · 读书大富翁」核心类型定义。
// 玩法约定：读书/打卡/投骰在群内完成，App 只做棋盘可视化与程序化结算——
// 录入骰子点数后由服务端按 100 格地图移动队伍并结算格子效果。

/** 格子类型：100 格均分五类，每类 20 格 */
export type TileKind = 'forward' | 'backward' | 'special' | 'swap' | 'blank'

/** 格子定义（服务端下发，运营可调整） */
export interface Tile {
  /** 1–100 */
  index: number
  kind: TileKind
  /** 面向用户的格子名（如「额外前进2格」「终点格」） */
  title: string
  /** 特殊功能格效果标识 */
  effect?: string
  /** 效果参数（前进/后退格数） */
  param?: number
  /** 双子格编号（位置互换格） */
  twin?: number
}

/** 生效中的 buff/debuff */
export interface Buff {
  kind: string
  /** 面向用户的效果文案 */
  label: string
  /** 剩余生效次数 */
  uses: number
}

/** 成员及其认领的彩虹色 */
export interface TeamMember {
  id: string
  userId: string
  name: string
  avatarUrl?: string
  isCaptain: boolean
  /** 认领的彩虹色：red/…/purple */
  color?: string
  bookCount: number
  wordCount: number
}

/** 队伍状态机：集彩虹中 / 可前进 / 已冲线 */
export type TeamStatus = 'collecting' | 'ready' | 'completed'

/** 队伍全量状态 */
export interface Team {
  id: string
  name: string
  color: string
  /** 彩虹徽章 key */
  emblem?: string
  members: TeamMember[]
  /** 当前所在格 0–100；0 起点，100 终点 */
  position: number
  /** 团队积累积分（每满 10 自动兑换万能骰子） */
  points: number
  /** 万能骰子持有数 */
  universalDice: number
  /** 掷骰前进机会：完成一轮彩虹 +1 */
  rollChances: number
  /** 已完成彩虹周期数 */
  rainbowCount: number
  /** 本周彩虹保底条数修正 */
  weekMinDelta: number
  /** 当前彩虹周期色块数（红橙黄绿青蓝紫） */
  colorBlocks: Record<string, number>
  /** 生效中的 buff/debuff */
  buffs: Buff[]
  status: TeamStatus
}

/** 棋盘全局快照 */
export interface BoardSnapshot {
  tiles: Tile[]
  teams: Team[]
  myTeamId?: string
  myMemberId?: string
  isCaptain: boolean
  enrolled: boolean
  myNickname?: string
  archived: boolean
  cycleStarted: boolean
  cycleStart: string
  cycleEnd: string
  /** 每周每队保底彩虹条数 */
  rainbowGuarantee: number
}

/** 骰子 / 万能骰子结算结果 */
export interface RollResult {
  /** 骰子面值 1–6（群里掷出，队长录入） */
  value: number
  fromTile: number
  toTile: number
  /** 净前进格数（可为负） */
  moved: number
  /** 本次净增团队积分 */
  points: number
  /** 本次自动兑换的万能骰子数 */
  diceExchanged: number
  /** 逐条效果文案 */
  results: string[]
  effects?: string[]
  won: boolean
  team: Team
}

/** 榜单行 */
export interface RankingRow {
  id: string
  rank: number
  name: string
  color: string
  position: number
  points: number
  universalDice: number
  rainbowCount: number
  isSelf: boolean
}

/** 时间线事件 */
export interface TimelineEvent {
  id: string
  type: string
  text: string
  createdAt: string
}

/** Toast 通知 */
export interface Toast {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
  duration?: number
}

/** 报名名单条目 */
export interface EnrollmentItem {
  id: string
  userId: string
  name: string
  avatarUrl?: string
  nickname?: string
  teamId?: string
  teamName?: string
  joined: boolean
}

/** 七色槽位（前端展示用，成员 -> 颜色） */
export const RAINBOW_KEYS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'] as const
export type RainbowColor = (typeof RAINBOW_KEYS)[number]