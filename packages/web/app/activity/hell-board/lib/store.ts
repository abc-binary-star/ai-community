'use client'

import { create } from 'zustand'
import * as api from './api'
import { RULES } from './board'
import { isTaskDone, litCount } from './rules'
import type {
  BoardSnapshot,
  CheckIn,
  CheckInBook,
  CheckInDraftBook,
  JudgementSession,
  RankingRow,
  RollResult,
  ServerBook,
  ServerCheckIn,
  ServerJudgement,
  ServerTile,
  Team,
  Tile,
} from './types'

// 掷骰点数、进度累加、点亮判定、保底触发、计时到期全部由 server-go 计算并落库，
// 前端只做展示与提交（PRD 第 12 节服务端权威）。
export const TILE_COUNT = 20

/** 书名归一化后比对，仅用于表单内即时提示；权威查重在服务端（P1-8）。
 *  字符集需与服务端 bookNoiseChars 保持一致（含『』与全角空格）。 */
export function normalizeBookKey(title: string, author: string): string {
  const clean = (s: string) => s.replace(/[《》〈〉「」『』【】（）()[\]\s\u3000]/g, '').toLowerCase()
  return `${clean(title)}::${clean(author)}`
}

// --- 服务端 DTO → 组件消费结构的映射 ---
// 服务端把判定规则与 AI 结论平铺下发，组件消费嵌套结构，在此统一转换。

/** 服务端格子定义转组件消费结构（审批台补卡等独立页面复用） */
export function toTile(t: ServerTile): Tile {
  return {
    index: t.index,
    title: t.title,
    taskType: t.taskType,
    target: t.target,
    unit: t.unit,
    specialRule: t.specialRule
      ? { kind: t.specialRule, label: t.specialRuleLabel ?? RULES[t.specialRule].label }
      : undefined,
  }
}

function toBook(b: ServerBook): CheckInBook {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    wordCount: b.wordCount,
    durationMinutes: b.durationMinutes,
    coverUrl: b.coverUrl,
    genre: b.genre,
    note: b.note,
    reviewStatus: b.reviewStatus,
    countsForTask: b.countsForTask,
    aiVerdict: b.aiStatus
      ? {
          status: b.aiStatus,
          confidence: b.aiConfidence ?? 0,
          reason: b.aiReason ?? '',
        }
      : undefined,
  }
}

function toCheckIn(c: ServerCheckIn): CheckIn {
  return {
    id: c.id,
    tileIndex: c.tileIndex,
    teamId: c.teamId,
    memberId: c.memberId,
    memberName: c.memberName,
    lap: c.lap,
    books: (c.books ?? []).map(toBook),
    evidenceUrl: c.evidenceUrl,
    createdAt: c.createdAt,
  }
}

function toJudgement(s: ServerJudgement | null): JudgementSession | null {
  if (!s) return null
  return {
    tileIndex: s.tileIndex,
    rule: { kind: s.rule, label: s.ruleLabel || RULES[s.rule].label },
    rolls: s.rolls ?? {},
    result: s.result,
  }
}

interface ActivityState {
  tiles: Tile[]
  teams: Team[]
  checkIns: CheckIn[]
  judgement: JudgementSession | null
  litRanking: RankingRow[]

  /** 当前用户身份，由服务端下发 */
  myTeamId: string | null
  myMemberId: string | null
  isCaptain: boolean
  /** 当前用户是否已报名活动（报名是入队的前提） */
  enrolled: boolean
  /** 报名请求进行中 */
  enrolling: boolean
  /** 活动周期已结束，页面转只读归档态（P1-7 / 验收标准 12） */
  archived: boolean
  cycleStarted: boolean
  fallbackThreshold: number

  /** 首次加载中 */
  loading: boolean
  /** 加载失败信息 */
  error: string | null
  /** 掷骰进行中，防止重复提交（服务端亦有并发保护） */
  rolling: boolean
  /** 最近一次前进掷骰的点数，用于骰子动画 */
  lastRoll: number | null
  /** 被点开查看详情的格子编号 */
  selectedTile: number | null

  loadAll: () => Promise<void>
  refresh: () => Promise<void>
  selectTile: (index: number | null) => void
  rollDice: () => Promise<void>
  advanceTeam: (steps: number) => Promise<RollResult | undefined>
  fallbackAdvance: (steps?: number) => Promise<void>
  rollJudgement: () => Promise<void>
  submitCheckIn: (tileIndex: number, books: CheckInDraftBook[], evidenceUrl?: string) => Promise<void>
  deleteCheckIn: (checkInId: string) => Promise<void>
  /** 队长初始化队伍进度（补录线下真实状态）；成功后刷新棋盘 */
  initializeTeam: (payload: { startTile: number; litTiles: number[]; currentTile: number }) => Promise<void>
  /** 当前用户的活动昵称；空串表示沿用账号昵称 */
  nickname: string
  /** 修改活动昵称（榜单/名单/时间线展示名）；成功后刷新快照 */
  updateNickname: (nickname: string) => Promise<void>
  /** 退出队伍（选错队伍时退出重选）；成功后刷新快照回到观战态 */
  leaveTeam: () => Promise<void>
  /** 入队后补选队长（队长位空缺时）；成功后刷新快照 */
  claimCaptain: () => Promise<void>
  /** 报名活动（幂等）；成功后刷新快照，enrolled 随之更新 */
  enroll: (nickname?: string) => Promise<void>
  /** 自助选组入队（可选成为队长）；成功后刷新快照进入队伍视图 */
  joinTeam: (teamId: string, isCaptain: boolean) => Promise<void>
  /** 表单内即时提示用的本地查重，返回重复书名。
   *  excludeCheckInId 用于编辑模式：跳过正在编辑的打卡自身，避免把修改中的书误判为重复提交。 */
  findDuplicates: (
    memberId: string,
    books: Array<{ title: string; author: string }>,
    excludeCheckInId?: string,
  ) => string[]
}

function applySnapshot(snapshot: BoardSnapshot) {
  return {
    tiles: (snapshot.tiles ?? []).map(toTile),
    // emblem 一律以服务端为准：未配置时显示「待选徽章」占位，不再按队伍顺序兜底
    // 分配（10 支队伍只有 9 张徽章素材，兜底会造成视觉重复）；emblemSet 供队长
    // 判断「一次性选择」是否已用掉
    teams: (snapshot.teams ?? []).map((t) => ({
      ...t,
      emblem: t.emblem,
      emblemSet: Boolean(t.emblem),
    })),
    myTeamId: snapshot.myTeamId ?? null,
    myMemberId: snapshot.myMemberId ?? null,
    isCaptain: snapshot.isCaptain ?? false,
    enrolled: snapshot.enrolled ?? false,
    nickname: snapshot.myNickname ?? '',
    archived: snapshot.archived ?? false,
    cycleStarted: snapshot.cycleStarted ?? true,
    fallbackThreshold: snapshot.fallbackThreshold ?? 40,
  }
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  tiles: [],
  teams: [],
  checkIns: [],
  judgement: null,
  litRanking: [],

  myTeamId: null,
  myMemberId: null,
  isCaptain: false,
  enrolled: false,
  nickname: '',
  enrolling: false,
  archived: false,
  cycleStarted: true,
  fallbackThreshold: 40,

  loading: true,
  error: null,
  rolling: false,
  lastRoll: null,
  selectedTile: null,

  /** 首屏加载：棋盘必需，其余数据缺失不阻断页面 */
  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const snapshot = await api.fetchBoard()
      set({ ...applySnapshot(snapshot), loading: false })
    } catch (err) {
      set({ loading: false, error: errMessage(err, '活动数据加载失败') })
      return
    }
    // 未入组用户只能观战，本队相关接口会返回 403，静默跳过
    if (!get().myTeamId) return
    await get().refresh()
  },

  /** 轮询刷新：棋盘 + 本队数据（PRD 第 12 节实时性）。
   *  数据未变化时不触发 set，避免每 10 秒整页重渲染（发热/空转来源）。 */
  refresh: async () => {
    try {
      const [snapshot, checkIns, judgement, litRanking] = await Promise.all([
        api.fetchBoard(),
        api.fetchCheckIns().catch(() => []),
        api.fetchJudgement().catch(() => null),
        api.fetchLitRanking().catch(() => []),
      ])
      const next = {
        ...applySnapshot(snapshot),
        checkIns: checkIns.map(toCheckIn),
        judgement: toJudgement(judgement),
        litRanking,
        error: null,
      }
      // 服务端数据未变化则跳过 set：Zustand 仅做浅比较，直接 set 会
      // 使所有订阅组件（棋盘/榜单/队伍/任务面板）整体重渲染
      const cur = get()
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
      // 漏比较的字段会让对应状态失效（如 archived 翻转、队长身份变更、格子文案调整）：
      // 全部服务端下发字段都参与比对，数据变化才会触发重渲染
      if (
        same(next.tiles, cur.tiles) &&
        same(next.teams, cur.teams) &&
        same(next.checkIns, cur.checkIns) &&
        same(next.judgement, cur.judgement) &&
        same(next.litRanking, cur.litRanking) &&
        next.myTeamId === cur.myTeamId &&
        next.myMemberId === cur.myMemberId &&
        next.isCaptain === cur.isCaptain &&
        next.enrolled === cur.enrolled &&
        next.nickname === cur.nickname &&
        next.archived === cur.archived &&
        next.cycleStarted === cur.cycleStarted &&
        next.fallbackThreshold === cur.fallbackThreshold
      ) {
        return
      }
      set(next)
    } catch (err) {
      set({ error: errMessage(err, '刷新失败') })
    }
  },

  selectTile: (index) => set({ selectedTile: index }),

  rollDice: async () => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      const result = await api.rollDice()
      set({ lastRoll: result.value })
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '掷骰失败') })
    } finally {
      set({ rolling: false })
    }
  },

  /** 队长手动前进指定格数（1–6 格，替代掷骰随机点数）。成功后刷新棋盘并返回结果 */
  advanceTeam: async (steps: number) => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      const result = await api.advanceTeam(steps)
      set({ lastRoll: result.value })
      await get().refresh()
      return result
    } catch (err) {
      set({ error: errMessage(err, '前进失败') })
      throw err
    } finally {
      set({ rolling: false })
    }
  },

  /** 队长消耗 40 本保底计数向下一格进发：steps 0=摇骰子，1–6=自选步数。成功后刷新棋盘 */
  fallbackAdvance: async (steps: number = 0) => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      const result = await api.fallbackAdvance(steps)
      set({ lastRoll: result.value })
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '保底前进失败') })
    } finally {
      set({ rolling: false })
    }
  },

  rollJudgement: async () => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      const session = await api.rollJudgement()
      set({ judgement: toJudgement(session), lastRoll: null })
      // 判定结算会改变队伍状态，需重新拉取棋盘
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '判定掷骰失败') })
    } finally {
      set({ rolling: false })
    }
  },

  submitCheckIn: async (tileIndex, books, evidenceUrl) => {
    set({ error: null })
    // 查重错误交由调用方捕获展示，不写入全局 error
    await api.submitCheckIn({ tileIndex, books, evidenceUrl })
    await get().refresh()
  },

  deleteCheckIn: async (checkInId) => {
    set({ error: null })
    try {
      await api.deleteCheckIn(checkInId)
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '撤回失败') })
    }
  },

  /** 队长初始化队伍进度（补录线下真实状态）；成功后刷新棋盘 */
  initializeTeam: async (payload) => {
    set({ error: null })
    await api.initializeTeam(payload)
    await get().refresh()
  },

  enroll: async (nickname) => {
    if (get().enrolling) return
    set({ enrolling: true, error: null })
    try {
      await api.enroll(nickname)
      set({ enrolled: true })
      // 报名后仍未入组，刷新即可看到报名状态；已入组场景由服务端幂等返回
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '报名失败') })
    } finally {
      set({ enrolling: false })
    }
  },

  joinTeam: async (teamId, isCaptain) => {
    if (get().enrolling) return
    set({ enrolling: true, error: null })
    try {
      await api.joinTeam(teamId, isCaptain)
      // 入队成功后刷新快照，myTeamId 就位后进入队伍视图
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '加入队伍失败') })
      throw err
    } finally {
      set({ enrolling: false })
    }
  },

  updateNickname: async (nickname) => {
    set({ error: null })
    try {
      await api.updateNickname(nickname)
      // 刷新快照：榜单与队伍名单的展示名立即跟着变
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '修改昵称失败') })
      throw err
    }
  },

  leaveTeam: async () => {
    set({ error: null })
    try {
      await api.leaveTeam()
      // 刷新快照：退出后右侧栏回到观战卡，可重新选队
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '退出队伍失败') })
      throw err
    }
  },

  claimCaptain: async () => {
    set({ error: null })
    try {
      await api.claimCaptain()
      // 刷新快照：isCaptain 就位后队长专属入口（掷骰/管理）立即出现
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '设置队长失败') })
      throw err
    }
  },

  findDuplicates: (memberId, books, excludeCheckInId) => {
    const existing = new Set<string>()
    get().checkIns.forEach((ci) => {
      if (ci.memberId !== memberId) return
      // 编辑模式跳过自身打卡，避免把正在修改的书误判为重复提交
      if (ci.id === excludeCheckInId) return
      // 已驳回或撤销的书目不占用查重名额，与服务端口径一致
      ci.books.forEach((b) => {
        if (b.reviewStatus === 'rejected' || b.reviewStatus === 'revoked') return
        existing.add(normalizeBookKey(b.title, b.author))
      })
    })
    return books
      .filter((b) => existing.has(normalizeBookKey(b.title, b.author)))
      .map((b) => b.title)
  },
}))

/** 当前用户所属队伍；未入组或未加载完成时为 null */
export function useCurrentTeam(): Team | null {
  return useActivityStore((s) => s.teams.find((t) => t.id === s.myTeamId) ?? null)
}

/** 当前用户是否为队长 */
export function useIsCaptain(): boolean {
  return useActivityStore((s) => s.isCaptain)
}

/** 格子定义，按编号取；数据未加载时返回 undefined */
export function useTile(index: number): Tile | undefined {
  return useActivityStore((s) => s.tiles.find((t) => t.index === index))
}

export { isTaskDone, litCount }
