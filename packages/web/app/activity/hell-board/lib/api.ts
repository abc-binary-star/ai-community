import { apiFetch } from '@/lib/api'
import type { BoardSnapshot, EnrollmentItem, RankingRow, RollResult, Team, TimelineEvent } from './types'

// 活动接口：读书/打卡/投骰在群内完成，App 负责棋盘可视化与程序化结算
const BASE = '/activity/hell-board'

/** 棋盘全局快照 */
export function fetchBoard(): Promise<BoardSnapshot> {
  return apiFetch<BoardSnapshot>(`${BASE}/board`)
}

/** 队长录入群里掷出的骰子点数，程序结算移动 + 格子效果 */
export function rollDice(value: number): Promise<RollResult> {
  return apiFetch<RollResult>(`${BASE}/roll`, { method: 'POST', body: JSON.stringify({ value }) })
}

/** 队长使用 1 枚万能骰子（无视当前格子效果） */
export function useUniversalDice(value: number): Promise<RollResult> {
  return apiFetch<RollResult>(`${BASE}/universal-dice`, { method: 'POST', body: JSON.stringify({ value }) })
}

/** 队长登记本轮彩虹集齐（+1 掷骰机会） */
export function completeCycle(): Promise<Team> {
  return apiFetch<Team>(`${BASE}/cycle`, { method: 'POST' })
}

/** 进度榜 */
export async function fetchRanking(): Promise<RankingRow[]> {
  const res = await apiFetch<{ items: RankingRow[] }>(`${BASE}/ranking`)
  return res.items ?? []
}

/** 本队时间线 */
export async function fetchTimeline(): Promise<TimelineEvent[]> {
  const res = await apiFetch<{ items: TimelineEvent[] }>(`${BASE}/timeline`)
  return res.items ?? []
}

/** 报名（幂等） */
export function enroll(nickname?: string): Promise<EnrollmentItem> {
  return apiFetch<EnrollmentItem>(`${BASE}/enroll`, {
    method: 'POST',
    body: JSON.stringify({ nickname: nickname ?? '' }),
  })
}

/** 自助入队（可选队长 + 认领彩虹色） */
export function joinTeam(teamId: string, isCaptain: boolean, color: string): Promise<Team> {
  return apiFetch<Team>(`${BASE}/team/join`, {
    method: 'POST',
    body: JSON.stringify({ teamId, isCaptain, color }),
  })
}

/** 认领/更换彩虹色 */
export function claimColor(color: string): Promise<Team> {
  return apiFetch<Team>(`${BASE}/team/color`, {
    method: 'POST',
    body: JSON.stringify({ color }),
  })
}

/** 修改活动内昵称 */
export function updateNickname(nickname: string): Promise<void> {
  return apiFetch<void>(`${BASE}/team/nickname`, {
    method: 'PUT',
    body: JSON.stringify({ nickname }),
  })
}

/** 退出队伍 */
export function leaveTeam(): Promise<void> {
  return apiFetch<void>(`${BASE}/team/leave`, { method: 'POST' })
}

/** 补选队长 */
export function claimCaptain(): Promise<void> {
  return apiFetch<void>(`${BASE}/team/claim-captain`, { method: 'POST' })
}

/** 报名名单（队长） */
export async function fetchEnrollments(): Promise<EnrollmentItem[]> {
  const res = await apiFetch<{ items: EnrollmentItem[] }>(`${BASE}/team/enrollments`)
  return res.items ?? []
}

/** 队长更新队名/徽章 */
export function captainUpdateTeam(payload: { name?: string; emblem?: string }): Promise<Team> {
  return apiFetch<Team>(`${BASE}/team`, { method: 'PUT', body: JSON.stringify(payload) })
}

/** 队长拉人入队 */
export function captainAddMember(userId: string): Promise<Team> {
  return apiFetch<Team>(`${BASE}/team/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

// --- 运营后台 ---

export async function fetchAdminTeams(): Promise<Team[]> {
  const res = await apiFetch<{ items: Team[] }>(`${BASE}/admin/teams`)
  return res.items ?? []
}

export function createTeam(payload: { name: string; color: string; emblem?: string }): Promise<Team> {
  return apiFetch<Team>(`${BASE}/admin/teams`, { method: 'POST', body: JSON.stringify(payload) })
}

export function adminUpdateTeam(teamId: string, payload: { name?: string; color?: string; emblem?: string }): Promise<Team> {
  return apiFetch<Team>(`${BASE}/admin/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteTeam(teamId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/admin/teams/${teamId}`, { method: 'DELETE' })
}

export function adminAddMember(teamId: string, payload: { username: string; isCaptain?: boolean }): Promise<Team> {
  return apiFetch<Team>(`${BASE}/admin/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function removeMember(memberId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/admin/members/${memberId}`, { method: 'DELETE' })
}

export function setCaptain(memberId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/admin/members/${memberId}/captain`, { method: 'PUT' })
}

export function adminUpdateTile(
  index: number,
  payload: { kind?: string; title?: string; effect?: string; param?: number; twin?: number },
): Promise<{ index: number; kind: string; title: string }> {
  return apiFetch(`${BASE}/admin/tiles/${index}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function manualFix(
  teamId: string,
  payload: { position?: number; points?: number; universalDice?: number; rollChances?: number; reason: string },
): Promise<Team> {
  return apiFetch<Team>(`${BASE}/admin/teams/${teamId}/manual-fix`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}