import { ApiError, apiFetch } from '@/lib/api'
import type {
  BoardSnapshot,
  BookLibraryItem,
  CheckInDraftBook,
  EnrollmentItem,
  FeedbackItem,
  FeedbackType,
  FeedItem,
  MemberProfile,
  RankingMetric,
  RankingRow,
  RankingSubject,
  ReviewQueueItem,
  RollResult,
  ServerBook,
  ServerCheckIn,
  ServerJudgement,
  TileDetail,
  TimelineEvent,
  VotePoolItem,
} from './types'

// 活动接口挂在独立路由分组下，与社区业务解耦（PRD 第 12 节）
const BASE = '/activity/hell-board'

/** 查重拦截错误：命中书名 → 已打卡的格子编号（P1-8 / 验收标准 10） */
export class DuplicateBookError extends Error {
  duplicates: Record<string, number>
  titles: string[]

  constructor(message: string, titles: string[], duplicates: Record<string, number>) {
    super(message)
    this.name = 'DuplicateBookError'
    this.titles = titles
    this.duplicates = duplicates
  }
}

/** 棋盘全局快照 */
export function fetchBoard(): Promise<BoardSnapshot> {
  return apiFetch<BoardSnapshot>(`${BASE}/board`)
}

/** 本队打卡列表 */
export async function fetchCheckIns(): Promise<ServerCheckIn[]> {
  const res = await apiFetch<{ items: ServerCheckIn[] }>(`${BASE}/checkins`)
  return res.items ?? []
}

/**
 * 提交打卡。服务端查重命中时抛 DuplicateBookError，
 * 携带书名与所在格子供前端提示。
 */
export async function submitCheckIn(payload: {
  tileIndex: number
  books: CheckInDraftBook[]
  evidenceUrl?: string
}): Promise<ServerCheckIn> {
  try {
    return await apiFetch<ServerCheckIn>(`${BASE}/checkins`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const detail = err.body as
        | { titles?: string[]; duplicates?: Record<string, number> }
        | null
        | undefined
      // 只有带 duplicates 的 409 才是查重命中，其余冲突（计时中、已完成）原样抛出
      if (detail?.duplicates) {
        throw new DuplicateBookError(err.message, detail.titles ?? [], detail.duplicates)
      }
    }
    throw err
  }
}

/** 管理员代成员补打卡（审批台「补卡」入口）。memberId 为目标成员（补卡人） */
export async function adminSubmitCheckIn(payload: {
  memberId: string
  tileIndex: number
  books: CheckInDraftBook[]
  evidenceUrl?: string
}): Promise<ServerCheckIn> {
  try {
    return await apiFetch<ServerCheckIn>(`${BASE}/admin/checkins`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const detail = err.body as
        | { titles?: string[]; duplicates?: Record<string, number> }
        | null
        | undefined
      if (detail?.duplicates) {
        throw new DuplicateBookError(err.message, detail.titles ?? [], detail.duplicates)
      }
    }
    throw err
  }
}

/** 撤回未进入终审的打卡（PRD 8.4） */
export function deleteCheckIn(checkInId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/checkins/${checkInId}`, { method: 'DELETE' })
}

/**
 * 修改自己历史打卡的内容（心得 / 字数 / 时长 / 书名 / 作者）。
 * 已通过审核的书若改动字数或时长，服务端会同步重算进度与榜单。
 */
export async function updateCheckIn(
  checkInId: string,
  payload: {
    tileIndex: number
    books: CheckInDraftBook[]
    evidenceUrl?: string
  },
): Promise<ServerCheckIn> {
  try {
    return await apiFetch<ServerCheckIn>(`${BASE}/checkins/${checkInId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const detail = err.body as
        | { titles?: string[]; duplicates?: Record<string, number> }
        | null
        | undefined
      if (detail?.duplicates) {
        throw new DuplicateBookError(err.message, detail.titles ?? [], detail.duplicates)
      }
    }
    throw err
  }
}

// --- 我的打卡（三栏：未审核 / 已通过 / 已驳回） ---

/** 我的打卡书目列表，按状态分组 */
export async function fetchMyBooks(
  status: 'pending' | 'approved' | 'rejected',
): Promise<ServerBook[]> {
  const res = await apiFetch<{ items: ServerBook[] }>(
    `${BASE}/my-books?status=${status}`,
  )
  return res.items ?? []
}

// --- 队长投票池（全员可见，仅队长可投） ---

/** 投票池列表 */
export async function fetchVotePool(): Promise<VotePoolItem[]> {
  const res = await apiFetch<{ items: VotePoolItem[] }>(`${BASE}/vote-pool`)
  return res.items ?? []
}

/** 队长投票。赞成过半时服务端直接结算打卡通过。 */
export function castVote(bookId: string, vote: 'approve' | 'reject'): Promise<VotePoolItem> {
  return apiFetch<VotePoolItem>(`${BASE}/vote-pool/${bookId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ vote }),
  })
}

// --- 成员阅读档案与打卡点赞（「全部队伍」标签页） ---

/** 成员已通过的打卡档案（总本数 / 总字数 / 总时长 + 各次打卡与点赞数） */
export function fetchMemberCheckIns(memberId: string): Promise<MemberProfile> {
  return apiFetch<MemberProfile>(`${BASE}/members/${memberId}/checkins`)
}

/** 点赞某次打卡（幂等） */
export function likeCheckIn(checkInId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/checkins/${checkInId}/like`, { method: 'POST' })
}

/** 取消点赞 */
export function unlikeCheckIn(checkInId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/checkins/${checkInId}/like`, { method: 'DELETE' })
}

/** 队长掷骰前进。点数由服务端生成（PRD 10.3 防篡改） */
export function rollDice(): Promise<RollResult> {
  return apiFetch<RollResult>(`${BASE}/roll`, { method: 'POST' })
}

/** 队长手动前进指定格数（1–6 格，替代掷骰）。步数由队长选择，服务端校验 */
export function advanceTeam(steps: number): Promise<RollResult> {
  return apiFetch<RollResult>(`${BASE}/advance`, {
    method: 'POST',
    body: JSON.stringify({ steps }),
  })
}

/** 队长消耗 40 本保底计数向下一格进发：steps 为自选步数（1–6），0 表示摇骰子随机 */
export function fallbackAdvance(steps: number = 0): Promise<RollResult> {
  return apiFetch<RollResult>(`${BASE}/advance/fallback`, {
    method: 'POST',
    body: JSON.stringify({ steps }),
  })
}

// --- 反馈（bug / 需求） ---

/** 提交活动反馈：进入管理员监督台（审批台）的待处理列表 */
export function submitFeedback(payload: {
  type: FeedbackType
  content: string
  contact?: string
}): Promise<FeedbackItem> {
  return apiFetch<FeedbackItem>(`${BASE}/feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 管理员查看反馈列表（审批台），支持按状态筛选 */
export function fetchFeedback(
  status?: 'pending' | 'resolved',
): Promise<{ items: FeedbackItem[]; total: number }> {
  const suffix = status ? `?status=${status}` : ''
  return apiFetch(`${BASE}/admin/feedback${suffix}`)
}

/** 管理员标记反馈已处理（可附回复） */
export function resolveFeedback(
  feedbackId: string,
  reply: string,
): Promise<FeedbackItem> {
  return apiFetch<FeedbackItem>(`${BASE}/admin/feedback/${feedbackId}`, {
    method: 'PUT',
    body: JSON.stringify({ reply }),
  })
}

/** 读取当前判定会话，当前格无特殊判定时返回 null */
export function fetchJudgement(): Promise<ServerJudgement | null> {
  return apiFetch<ServerJudgement | null>(`${BASE}/judgement`)
}

/** 参与特殊判定掷骰（P0-2） */
export function rollJudgement(): Promise<ServerJudgement> {
  return apiFetch<ServerJudgement>(`${BASE}/judgement/roll`, { method: 'POST' })
}

/** 格子打卡记录（PRD 8.2） */
export function fetchTileDetail(index: number): Promise<TileDetail> {
  return apiFetch<TileDetail>(`${BASE}/tiles/${index}`)
}

/** 四榜（PRD 第 11 节） */
export async function fetchRanking(
  metric: RankingMetric,
  subject: RankingSubject,
): Promise<RankingRow[]> {
  const res = await apiFetch<{ items: RankingRow[] }>(
    `${BASE}/ranking?metric=${metric}&subject=${subject}`,
  )
  return res.items ?? []
}

/** 点亮进度榜，活动主进度看板 */
export async function fetchLitRanking(): Promise<RankingRow[]> {
  const res = await apiFetch<{ items: RankingRow[] }>(`${BASE}/ranking/lit`)
  return res.items ?? []
}


/**
 * 第 20 格候选书库：关键词为空时返回全量（服务端按书名+作者去重、只含已通过审核的书目），
 * 因此既可用于搜索选书，也可用于整本书库浏览。
 */
export async function fetchBookLibrary(keyword: string, limit?: number): Promise<BookLibraryItem[]> {
  const params = new URLSearchParams()
  if (keyword) params.set('keyword', keyword)
  if (limit) params.set('limit', String(limit))
  const q = params.toString()
  const res = await apiFetch<{ items: BookLibraryItem[] }>(`${BASE}/library${q ? `?${q}` : ''}`)
  return res.items ?? []
}

/** 本队时间线（PRD 10.3）：打卡 / 审核 / 掷骰 / 点亮 / 判定 / 保底 / 计时 / 人工事件 */
export async function fetchTimeline(): Promise<TimelineEvent[]> {
  const res = await apiFetch<{ items: TimelineEvent[] }>(`${BASE}/timeline`)
  return res.items ?? []
}

/** 活动大事件流：全员打卡 + 全场事件合并，观战用户也可查看 */
export async function fetchFeed(): Promise<FeedItem[]> {
  const res = await apiFetch<{ items: FeedItem[] }>(`${BASE}/feed`)
  return res.items ?? []
}

// --- 人工终审台（PRD 9.3，仅管理员与版主） ---

/** 审核队列 */
export function fetchReviewQueue(params: {
  teamId?: string
  tileIndex?: number
  status?: string
  page?: number
}): Promise<{ items: ReviewQueueItem[]; total: number; totalPages: number; page: number }> {
  const q = new URLSearchParams()
  if (params.teamId) q.set('teamId', params.teamId)
  if (params.tileIndex) q.set('tileIndex', String(params.tileIndex))
  if (params.status) q.set('status', params.status)
  if (params.page) q.set('page', String(params.page))
  const suffix = q.toString() ? `?${q.toString()}` : ''
  return apiFetch(`${BASE}/admin/reviews${suffix}`)
}

/** 终审单条书目。驳回与撤销必须带理由 */
export function reviewBook(
  bookId: string,
  payload: {
    action: 'approve' | 'reject' | 'revoke'
    reason?: string
    countsForTask?: boolean
    violation?: boolean
  },
): Promise<void> {
  return apiFetch<void>(`${BASE}/admin/reviews/${bookId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 批量确认 AI 通过项 */
export function batchApprove(bookIds: string[]): Promise<{ approved: number }> {
  return apiFetch(`${BASE}/admin/reviews/batch-approve`, {
    method: 'POST',
    body: JSON.stringify({ bookIds }),
  })
}

/** 更新队伍信息（运营后台：仅管理员与版主）。name / color 必填，emblem 为形象 key */
export function updateTeam(
  teamId: string,
  payload: { name: string; color: string; emblem?: string },
): Promise<void> {
  return apiFetch<void>(`${BASE}/admin/teams/${teamId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

// --- 报名与队长管理 ---

/** 报名活动（入队的前提），可携带活动内昵称。重复报名幂等返回当前状态 */
export function enroll(nickname?: string): Promise<EnrollmentItem> {
  return apiFetch<EnrollmentItem>(`${BASE}/enroll`, {
    method: 'POST',
    body: JSON.stringify({ nickname: nickname ?? '' }),
  })
}

/** 自助选组入队：报名用户直接加入队伍，可同步选择成为队长 */
export function joinTeam(teamId: string, isCaptain: boolean): Promise<unknown> {
  return apiFetch(`${BASE}/team/join`, {
    method: 'POST',
    body: JSON.stringify({ teamId, isCaptain }),
  })
}

/** 修改活动内昵称：影响榜单、队伍名单与时间线的展示名 */
export function updateNickname(nickname: string): Promise<unknown> {
  return apiFetch(`${BASE}/team/nickname`, {
    method: 'PUT',
    body: JSON.stringify({ nickname }),
  })
}

/** 退出队伍：选错队伍时退出重选，仅在还没有任何打卡/掷骰/投票时允许 */
export function leaveTeam(): Promise<unknown> {
  return apiFetch(`${BASE}/team/leave`, { method: 'POST' })
}

/** 入队后补选队长：仅当本队队长位空缺时可用（入队时没勾队长的补救入口） */
export function claimCaptain(): Promise<unknown> {
  return apiFetch(`${BASE}/team/claim-captain`, { method: 'POST' })
}

/** 报名名单（仅队长可见）：已报名人员及入队状态 */
export async function fetchEnrollments(): Promise<EnrollmentItem[]> {
  const res = await apiFetch<{ items: EnrollmentItem[] }>(`${BASE}/team/enrollments`)
  return res.items ?? []
}

/** 队长更新队名 / 一次性选择队伍形象。形象一经确定不可更换 */
export function captainUpdateTeam(payload: {
  name: string
  color: string
  emblem?: string
}): Promise<void> {
  return apiFetch<void>(`${BASE}/team`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

/** 队长从报名名单拉人入队 */
export function captainAddMember(userId: string): Promise<unknown> {
  return apiFetch(`${BASE}/team/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

/** 队长初始化队伍进度：补录活动已开始后的起始格 / 已点亮格 / 当前格（幂等覆盖） */
export function initializeTeam(payload: {
  startTile: number
  litTiles: number[]
  currentTile: number
}): Promise<unknown> {
  return apiFetch(`${BASE}/team/initialize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
