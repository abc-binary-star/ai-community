'use client'

import { create } from 'zustand'
import * as api from './api'
import { RULES } from './board'
import { EMBLEMS } from './emblems'
import { isTaskDone, litCount } from './rules'
import type {
  BoardSnapshot,
  CheckIn,
  CheckInBook,
  CheckInDraftBook,
  JudgementSession,
  RankingRow,
  ServerBook,
  ServerCheckIn,
  ServerJudgement,
  ServerTile,
  Team,
  Tile,
  TimelineEvent,
} from './types'

// 掷骰点数、进度累加、点亮判定、保底触发、计时到期全部由 server-go 计算并落库，
// 前端只做展示与提交（PRD 第 12 节服务端权威）。
export const TILE_COUNT = 20

/** 书名归一化后比对，仅用于表单内即时提示；权威查重在服务端（P1-8） */
export function normalizeBookKey(title: string, author: string): string {
  const clean = (s: string) => s.replace(/[《》〈〉「」【】（）()[\]\s]/g, '').toLowerCase()
  return `${clean(title)}::${clean(author)}`
}

// --- 服务端 DTO → 组件消费结构的映射 ---
// 服务端把判定规则与 AI 结论平铺下发，组件消费嵌套结构，在此统一转换。

function toTile(t: ServerTile): Tile {
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
  timeline: TimelineEvent[]
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
  rollJudgement: () => Promise<void>
  submitCheckIn: (tileIndex: number, books: CheckInDraftBook[], evidenceUrl?: string) => Promise<void>
  deleteCheckIn: (checkInId: string) => Promise<void>
  /** 报名活动（幂等）；成功后刷新快照，enrolled 随之更新 */
  enroll: () => Promise<void>
  /** 表单内即时提示用的本地查重，返回重复书名 */
  findDuplicates: (memberId: string, books: Array<{ title: string; author: string }>) => string[]
}

function applySnapshot(snapshot: BoardSnapshot) {
  return {
    tiles: (snapshot.tiles ?? []).map(toTile),
    // 服务端未配置 emblem 时按队伍顺序兜底分配形象，保证每个队伍都有标志；
    // emblemSet 保留服务端真实状态，供队长判断「一次性选择」是否已用掉
    teams: (snapshot.teams ?? []).map((t, i) => ({
      ...t,
      emblem: t.emblem || EMBLEMS[i % EMBLEMS.length].key,
      emblemSet: Boolean(t.emblem),
    })),
    myTeamId: snapshot.myTeamId ?? null,
    myMemberId: snapshot.myMemberId ?? null,
    isCaptain: snapshot.isCaptain ?? false,
    enrolled: snapshot.enrolled ?? false,
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
  timeline: [],
  judgement: null,
  litRanking: [],

  myTeamId: null,
  myMemberId: null,
  isCaptain: false,
  enrolled: false,
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

  /** 轮询刷新：棋盘 + 本队数据（PRD 第 12 节实时性） */
  refresh: async () => {
    try {
      const [snapshot, checkIns, timeline, judgement, litRanking] = await Promise.all([
        api.fetchBoard(),
        api.fetchCheckIns().catch(() => []),
        api.fetchTimeline().catch(() => []),
        api.fetchJudgement().catch(() => null),
        api.fetchLitRanking().catch(() => []),
      ])
      set({
        ...applySnapshot(snapshot),
        checkIns: checkIns.map(toCheckIn),
        timeline,
        judgement: toJudgement(judgement),
        litRanking,
        error: null,
      })
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

  enroll: async () => {
    if (get().enrolling) return
    set({ enrolling: true, error: null })
    try {
      await api.enroll()
      set({ enrolled: true })
      // 报名后仍未入组，刷新即可看到报名状态；已入组场景由服务端幂等返回
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '报名失败') })
    } finally {
      set({ enrolling: false })
    }
  },

  findDuplicates: (memberId, books) => {
    const existing = new Set<string>()
    get().checkIns.forEach((ci) => {
      if (ci.memberId !== memberId) return
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
