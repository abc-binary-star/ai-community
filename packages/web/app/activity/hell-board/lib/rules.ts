import type { Team, TeamStatus, Tile } from './types'
import { KIND_META, isFinish, RAINBOW, RAINBOW_ORDER } from './board'
import type { RainbowColor } from './types'

/** 格子编号转中文序数（第 X 格） */
export function posText(n: number): string {
  if (n === 0) return '起点'
  const cn = [
    '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  ]
  if (n <= 10) return `第${cn[n]}格`
  if (n < 20) return `第十${n % 10 === 0 ? '' : cn[n % 10]}格`
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `第${cn[tens]}十${ones === 0 ? '' : cn[ones]}格`
}

/** 队伍状态展示 */
export function statusMeta(status: TeamStatus): { label: string; chip: string } {
  switch (status) {
    case 'completed':
      return { label: '已冲线', chip: 'bg-amber-100 text-amber-800 border-amber-300' }
    case 'ready':
      return { label: '可掷骰', chip: 'bg-sky-100 text-sky-800 border-sky-300' }
    default:
      return { label: '集彩虹中', chip: 'bg-violet-100 text-violet-800 border-violet-300' }
  }
}

/** 当前格子的展示副标题：类型 + 关键参数 */
export function tileMeta(tile: Tile | undefined): { title: string; kindLabel: string } {
  if (!tile) return { title: '起点', kindLabel: '棋盘' }
  if (isFinish(tile.index)) return { title: '终点格', kindLabel: '🏁 冲线获胜' }
  return { title: tile.title, kindLabel: KIND_META[tile.kind].label }
}

/** 特殊功能格效果 → 面向用户的完整文案（与服务端 EffectLabels 保持一致） */
export const EFFECT_TEXT: Record<string, string> = {
  'guaranteed-advance': '保底冲刺：本次掷骰若≤2步，直接保底前进4格',
  'roll-double': '步数翻倍：下一次掷骰最终步数×2',
  immunity: '无损通行：下一轮行走所有负面格子（后退格）失效',
  'color-orphan': '色块空缺：下一轮集彩虹需多补读1本书才可通关',
  'rainbow-stall': '彩虹卡顿：下一轮集齐彩虹少1次掷骰机会',
  'rainbow-bonus': '彩虹加成：下一轮集齐彩虹额外多1次掷骰机会',
  'point-double': '积分暴击：本次骰子积分双倍结算',
  'point-flat': '积分低迷：本次掷骰无论单双统一只积1分',
  'point-minus-2': '积分倒扣：扣除当前团队积分2分',
  'team-accel': '全队加速：接下来两次掷骰固定+2步数',
  'roll-halve': '步数折半：本次掷骰最终行走步数减半（向下取整）',
  stall: '冷却停滞：下一轮掷骰无效，原地停留一回合',
  'drop-dice': '道具掉落：全队直接赠送万能骰子×1',
  'seal-dice': '道具封印：本局暂时禁止使用万能骰子1次',
  'immunity-buff': '惩罚免疫：永久保存1次「后退格无效」免疫buff',
  'lucky-choose': '幸运三选一：随机获得 万能骰子/免费彩虹/积分+5 其一',
  'fate-backward': '运势走低：下一次踩中前进格，额外前进效果直接失效',
  'end-decel': '终点减速：退回原来的位置',
  'bottom-quota': '保底扩容：团队本周最低彩虹保底条数-1',
  'unyielding-back': '随机回荡：无条件额外后退 2 格',
}

/** 格子完整描述：类型 + 具体效果（悬浮说明与详情弹窗共用） */
export function tileDetailText(tile: Tile): string {
  if (isFinish(tile.index)) return '终点格：率先走完 100 格冲线夺冠！'
  switch (tile.kind) {
    case 'special':
      return tile.effect ? EFFECT_TEXT[tile.effect] ?? '特殊功能格' : '特殊功能格'
    case 'swap':
      return (tile.twin ?? 0) > 0 ? `位置互换格：踩中后与第 ${tile.twin} 格互换位置` : '位置互换格'
    case 'forward':
      return (tile.param ?? 0) > 0 ? `前进格：额外前进 ${tile.param} 格` : '前进格：额外前进 1–3 格'
    case 'backward':
      return (tile.param ?? 0) > 0 ? `后退格：后退 ${tile.param} 格` : '后退格：随机后退 1–3 格'
    default:
      return '空白格：无奖励、无惩罚，停留原地'
  }
}

/** 队伍当前不可操作的原因（null = 可操作） */
export function blockedReason(team: Team, isCaptain: boolean, archived: boolean): string | null {
  if (archived) return '活动已结束，只读归档'
  if (team.status === 'completed') return '本队已冲线获胜'
  if (team.status === 'collecting') return '本轮彩虹未集齐，先完成一轮彩虹获得掷骰机会'
  if (team.rollChances <= 0) return '掷骰机会为 0，登记本轮彩虹集齐后 +1'
  if (!isCaptain) return '等待队长在群里掷骰并录入点数'
  return null
}

/** 万能骰子可按下说明 */
export function universalDiceHint(team: Team): string {
  if (team.universalDice <= 0) {
    return '团队积分每满 10 分自动兑换 1 枚'
  }
  return `持有 ${team.universalDice} 枚，可随时使用`
}

/** 彩虹色名（key → 中文） */
export function colorLabel(key?: string): string {
  if (!key) return '未认领'
  return RAINBOW[key as RainbowColor]?.label ?? key
}

/** 彩虹 7 色有序工具 */
export function rainbowOrder(): { key: RainbowColor; label: string; hex: string }[] {
  return RAINBOW_ORDER.map((k) => ({ key: k, label: RAINBOW[k].label, hex: RAINBOW[k].hex }))
}