import { FALLBACK_THRESHOLD, PENALTY_TILE_INDEX, TILE_COUNT } from './board'
import type { JudgementSession, Team, Tile } from './types'

// 展示层规则函数，对应 PRD 第 7 节游戏流程与 7.2 状态机。
//
// 权威判定在服务端执行（PRD 第 12 节「服务端权威」）：队伍状态、点亮、
// 保底触发、判定结果均由接口下发。这里保留同一套口径，仅用于进度条与
// 按钮可用性等即时展示，不参与任何写操作的决策。

/** 任务是否达成 */
export function isTaskDone(team: Team, tile: Tile): boolean {
  if (tile.taskType === 'timed-penalty') return false
  return team.tileProgress >= tile.target
}

/** 保底是否达成：本格累计通过审核 40 本（P1-5）。阈值由服务端下发 */
export function isFallbackDone(
  team: Team,
  tile: Tile,
  threshold: number = FALLBACK_THRESHOLD,
): boolean {
  // 计时惩罚格不适用保底（P1-6）
  if (tile.taskType === 'timed-penalty') return false
  return team.fallbackCount >= threshold
}

/** 当前是否可以提交打卡：计时中与已完成不可提交 */
export function canSubmitCheckIn(team: Team): boolean {
  return team.status !== 'timer-running' && team.status !== 'completed'
}

/** 当前是否可以掷骰前进：仅待掷骰状态，且必须是队长 */
export function canRollDice(team: Team, isCaptain: boolean): boolean {
  return isCaptain && team.status === 'awaiting-roll'
}

/** 是否处于待判定状态：该格任务已达成，等待全员掷判定骰 */
export function isAwaitingJudgement(team: Team): boolean {
  return team.status === 'awaiting-judgement'
}

/** 点亮格数 */
export function litCount(team: Team): number {
  return Object.keys(team.litTiles).length
}

/** 剩余未点亮格子编号，升序 */
export function remainingTiles(team: Team): number[] {
  const out: number[] = []
  for (let i = 1; i <= TILE_COUNT; i += 1) {
    if (!team.litTiles[i]) out.push(i)
  }
  return out
}

/** 计时惩罚格剩余毫秒；未计时返回 0 */
export function timerRemainingMs(team: Team, now: number): number {
  if (!team.timerEndsAt) return 0
  return Math.max(0, Date.parse(team.timerEndsAt) - now)
}

/** 判定会话是否全员已掷。聚合结果由服务端下发，前端不自行判定 */
export function isJudgementComplete(session: JudgementSession, memberCount: number): boolean {
  const rolled = Object.values(session.rolls).filter((v) => typeof v === 'number')
  return rolled.length >= memberCount
}

/** 落入的格子是否为计时惩罚格 */
export function isPenaltyTile(index: number): boolean {
  return index === PENALTY_TILE_INDEX
}

/** 队伍不可操作的原因文案，用于按钮禁用说明 */
export function blockedReason(team: Team, isCaptain: boolean): string | null {
  if (team.status === 'completed') return '本队已点亮全部 20 格，活动完成'
  if (team.status === 'timer-running') return `落入第 ${PENALTY_TILE_INDEX} 格惩罚计时中，期间无法打卡与掷骰`
  if (team.status === 'awaiting-judgement') return '任务已达成，全员各掷一次判定骰后才能前进'
  if (team.status === 'awaiting-roll' && !isCaptain) return '已可前进，等待队长掷骰'
  return null
}

/** 格式化字数：超过 1 万显示为万字 */
export function formatWords(n: number): string {
  if (n >= 10_000) {
    const w = n / 10_000
    return `${w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')} 万字`
  }
  return `${n.toLocaleString('zh-CN')} 字`
}

/** 格式化任务进度数值，字数类任务用万字表示 */
export function formatProgressValue(value: number, tile: Tile): string {
  if (tile.taskType === 'total-words') return formatWords(value)
  return `${value} ${tile.unit}`
}

/**
 * 格式化阅读时长（入参为分钟），与打卡表单的「几小时几分钟」口径一致。
 * 注意与下方 formatDuration 区分：后者服务惩罚格倒计时，入参是毫秒。
 */
export function formatReadingMinutes(minutes: number): string {
  if (minutes <= 0) return '0 分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} 分钟`
  if (m === 0) return `${h} 小时`
  return `${h} 小时 ${m} 分钟`
}

/** 剩余计时格式化为「Xh Ym」 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d} 天 ${h % 24} 小时`
  }
  return `${h} 小时 ${m} 分`
}
