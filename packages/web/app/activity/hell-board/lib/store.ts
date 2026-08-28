'use client'

import { create } from 'zustand'
import * as api from './api'
import type { BoardSnapshot, RollResult, Team, TimelineEvent, Toast } from './types'

/** 掷骰/万能骰子等写操作的全局状态管理；权威计算在服务端 */
export const TILE_COUNT = 100

interface ActivityState {
  tiles: BoardSnapshot['tiles']
  teams: Team[]
  myTeamId: string | null
  myMemberId: string | null
  isCaptain: boolean
  enrolled: boolean
  nickname: string
  archived: boolean
  cycleStarted: boolean
  rainbowGuarantee: number

  loading: boolean
  error: string | null
  /** 写操作进行中（防重复提交） */
  rolling: boolean
  /** 最近一次掷骰结算结果（弹窗展示） */
  lastOutcome: RollResult | null
  /** 被点开查看详情的格子编号 */
  selectedTile: number | null
  /** 本队时间线 */
  timeline: TimelineEvent[]
  /** Toast 通知队列 */
  toasts: Toast[]

  loadAll: () => Promise<void>
  refresh: () => Promise<boolean>
  selectTile: (index: number | null) => void
  closeOutcome: () => void
  clearError: () => void
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  rollDice: (value: number) => Promise<void>
  useUniversalDice: (value: number) => Promise<void>
  completeCycle: () => Promise<void>
  enroll: (nickname?: string) => Promise<void>
  joinTeam: (teamId: string, isCaptain: boolean, color: string) => Promise<void>
  claimColor: (color: string) => Promise<void>
  updateNickname: (nickname: string) => Promise<void>
  leaveTeam: () => Promise<void>
  claimCaptain: () => Promise<void>
}

function applySnapshot(s: BoardSnapshot) {
  return {
    tiles: s.tiles ?? [],
    teams: s.teams ?? [],
    myTeamId: s.myTeamId ?? null,
    myMemberId: s.myMemberId ?? null,
    isCaptain: s.isCaptain ?? false,
    enrolled: s.enrolled ?? false,
    nickname: s.myNickname ?? '',
    archived: s.archived ?? false,
    cycleStarted: s.cycleStarted ?? true,
    rainbowGuarantee: s.rainbowGuarantee ?? 4,
  }
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  tiles: [],
  teams: [],
  myTeamId: null,
  myMemberId: null,
  isCaptain: false,
  enrolled: false,
  nickname: '',
  archived: false,
  cycleStarted: true,
  rainbowGuarantee: 4,
  loading: true,
  error: null,
  rolling: false,
  lastOutcome: null,
  selectedTile: null,
  timeline: [],
  toasts: [],

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const snapshot = await api.fetchBoard()
      set({ ...applySnapshot(snapshot), loading: false })
    } catch (err) {
      set({ loading: false, error: errMessage(err, '活动数据加载失败') })
      return
    }
    await get().refresh()
  },

  /** 轮询刷新：棋盘 + 本队时间线；数据未变化时不触发 set。返回是否成功 */
  refresh: async () => {
    try {
      const snapshot = await api.fetchBoard()
      const timeline = get().myTeamId ? await api.fetchTimeline().catch(() => []) : []
      const next = {
        ...applySnapshot(snapshot),
        timeline,
        error: null,
      }
      const cur = get()
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
      if (
        same(next.tiles, cur.tiles) &&
        same(next.teams, cur.teams) &&
        same(next.timeline, cur.timeline) &&
        next.myTeamId === cur.myTeamId &&
        next.myMemberId === cur.myMemberId &&
        next.isCaptain === cur.isCaptain &&
        next.enrolled === cur.enrolled &&
        next.nickname === cur.nickname &&
        next.archived === cur.archived &&
        next.cycleStarted === cur.cycleStarted &&
        next.rainbowGuarantee === cur.rainbowGuarantee
      ) {
        return true
      }
      set(next)
      return true
    } catch (err) {
      set({ error: errMessage(err, '刷新失败') })
      return false
    }
  },

  selectTile: (index) => set({ selectedTile: index }),
  closeOutcome: () => set({ lastOutcome: null }),
  clearError: () => set({ error: null }),

  pushToast: (toast) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    const duration = toast.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => get().dismissToast(id), duration)
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  rollDice: async (value) => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      const outcome = await api.rollDice(value)
      set({ lastOutcome: outcome })
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '掷骰失败') })
    } finally {
      set({ rolling: false })
    }
  },

  useUniversalDice: async (value) => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      const outcome = await api.useUniversalDice(value)
      set({ lastOutcome: outcome })
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '万能骰子使用失败') })
    } finally {
      set({ rolling: false })
    }
  },

  completeCycle: async () => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      await api.completeCycle()
      await get().refresh()
      get().pushToast({ message: '已登记，掷骰机会 +1', tone: 'success' })
    } catch (err) {
      set({ error: errMessage(err, '登记失败') })
    } finally {
      set({ rolling: false })
    }
  },

  enroll: async (nickname) => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      await api.enroll(nickname)
      set({ enrolled: true })
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '报名失败') })
    } finally {
      set({ rolling: false })
    }
  },

  joinTeam: async (teamId, isCaptain, color) => {
    if (get().rolling) return
    set({ rolling: true, error: null })
    try {
      await api.joinTeam(teamId, isCaptain, color)
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '加入队伍失败') })
      throw err
    } finally {
      set({ rolling: false })
    }
  },

  claimColor: async (color) => {
    set({ error: null })
    try {
      await api.claimColor(color)
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '认领颜色失败') })
      throw err
    }
  },

  updateNickname: async (nickname) => {
    set({ error: null })
    try {
      await api.updateNickname(nickname)
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
      await get().refresh()
    } catch (err) {
      set({ error: errMessage(err, '设置队长失败') })
      throw err
    }
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

/** 格子定义，按编号取 */
export function useTile(index: number) {
  return useActivityStore((s) => s.tiles.find((t) => t.index === index))
}