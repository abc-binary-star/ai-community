// 活动「无限循环读书地狱」核心类型定义
// 对应 Pre-PRD 第 5 节「核心概念与数据对象」

/** 任务类型，驱动 AI 初审的校验字段（PRD 第 6 / 9 节） */
export type TileTaskType =
  | 'title-length'
  | 'cover-color'
  | 'genre'
  | 'author-nationality'
  | 'same-author'
  | 'plain-count'
  | 'total-words'
  | 'total-duration'
  | 'group-cross'
  | 'timed-penalty'

/** 特殊判定规则：全员各掷一次骰，全部满足才通过（P0-2） */
export type SpecialRuleKind = 'all-odd' | 'all-even' | 'all-below-4' | 'all-above-3'

export interface SpecialRule {
  kind: SpecialRuleKind
  /** 面向用户的规则文案 */
  label: string
}

/** 格子定义，活动期内不变 */
export interface Tile {
  /** 1–20，第 20 格之后回到第 1 格 */
  index: number
  title: string
  taskType: TileTaskType
  /** 目标数量：本数 / 字数 / 小时数 / 小时（计时格） */
  target: number
  /** 目标单位文案，如「本」「字」「小时」 */
  unit: string
  specialRule?: SpecialRule
}

/** 队伍状态机（PRD 7.2） */
export type TeamStatus =
  | 'in-progress'
  | 'awaiting-judgement'
  | 'awaiting-roll'
  | 'timer-running'
  | 'completed'

/** 点亮方式 */
export type LitReason = 'task' | 'fallback' | 'timer' | 'manual' | 'initial'

export interface TeamMember {
  id: string
  name: string
  avatarUrl?: string
  isCaptain: boolean
  /** 累计通过审核的书目数 */
  bookCount: number
  /** 累计通过审核的字数 */
  wordCount: number
}

export interface Team {
  id: string
  name: string
  /** 10 个队伍各分配一种可区分配色（PRD 10.2） */
  color: string
  /** 队伍形象 key（werewolf / detective / witch …），由服务端下发或前端按序兜底 */
  emblem?: string
  /** 服务端是否已落库形象（一次性选择判定：已确定则队长不可再换） */
  emblemSet?: boolean
  members: TeamMember[]
  /** 当前所在格编号 1–20 */
  position: number
  /** 已点亮格子编号 → 点亮方式 */
  litTiles: Record<number, LitReason>
  status: TeamStatus
  /** 当前格任务累计完成量（仅统计符合条件的书） */
  tileProgress: number
  /** 当前格保底计数，达 40 触发保底（P1-5） */
  fallbackCount: number
  /** 计时惩罚格到期时间（ISO），仅 timer-running 时有值 */
  timerEndsAt?: string
  /** 已绕圈轮次 */
  lap: number
}

/** 审核状态流（PRD 9.1） */
export type ReviewStatus =
  | 'pending-ai'
  | 'ai-passed'
  | 'ai-unsure'
  | 'ai-rejected'
  /** 已进入队长投票池，等待过半赞成（情况三封面直进，情况一/二 AI 未过进入） */
  | 'in-voting'
  | 'approved'
  | 'rejected'
  /** 已通过后被管理员撤销，进度与榜单数据同步回滚（PRD 8.4 / 验收标准 8） */
  | 'revoked'

export interface AiVerdict {
  status: 'passed' | 'unsure' | 'rejected' | 'skipped'
  /** 0–1 置信度 */
  confidence: number
  reason: string
}

/** 一条书目记录，打卡以「书」为最小单位（PRD 8.1） */
export interface CheckInBook {
  id: string
  /** 必填三要素之一 */
  title: string
  /** 必填三要素之一 */
  author: string
  /** 必填三要素之一，成员自填 */
  wordCount: number
  /** 累计时长任务必填，单位分钟 */
  durationMinutes?: number
  coverUrl?: string
  genre?: string
  note?: string
  reviewStatus: ReviewStatus
  aiVerdict?: AiVerdict
  /** 是否计入当前格任务进度（符合格子条件） */
  countsForTask: boolean
}

/** 成员针对某格提交的一次打卡 */
export interface CheckIn {
  id: string
  tileIndex: number
  teamId: string
  memberId: string
  memberName: string
  /** 该格所处轮次，跨轮次落入同格时分组展示（PRD 8.2） */
  lap: number
  books: CheckInBook[]
  evidenceUrl?: string
  createdAt: string
}

/** 掷骰记录（PRD 第 5 节） */
export interface DiceRoll {
  id: string
  teamId: string
  rollerId: string
  rollerName: string
  value: number
  fromTile: number
  toTile: number
  /** 是否为特殊判定掷骰 */
  isJudgement: boolean
  createdAt: string
}

/** 特殊判定进行态：全员各掷一次 */
export interface JudgementSession {
  tileIndex: number
  rule: SpecialRule
  /** 成员 id → 点数，未掷为 undefined */
  rolls: Record<string, number | undefined>
  /** 全员掷完后的聚合结果 */
  result?: 'passed' | 'failed'
}

/** 队伍时间线事件类型（PRD 10.3） */
export type TimelineEventType =
  | 'checkin'
  | 'review'
  | 'roll'
  | 'lit'
  | 'judgement'
  | 'fallback'
  | 'timer'
  | 'manual'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  text: string
  createdAt: string
}

/** 活动大事件流条目：全员打卡（kind=checkin）与全场事件（kind=event）的合并流 */
export interface FeedItem {
  id: string
  kind: 'checkin' | 'event'
  type: TimelineEventType
  teamId: string
  teamName: string
  teamColor?: string
  teamEmblem?: string
  memberName?: string
  tileIndex?: number
  lap?: number
  text?: string
  bookCount?: number
  wordCount?: number
  /** 仅本队可见的书名清单；其他队伍只下发数量 */
  bookTitles?: string[]
  ownTeam: boolean
  createdAt: string
}

/** 榜单维度与主体（PRD 第 11 节） */
export type RankingMetric = 'books' | 'words'
export type RankingSubject = 'team' | 'member'

export interface RankingRow {
  id: string
  rank: number
  name: string
  /** 队伍榜为队伍自身配色，个人榜为所属队伍配色 */
  color: string
  bookCount: number
  wordCount: number
  litCount: number
  /** 个人榜展示所属队伍名 */
  teamName?: string
  /** 是否为当前用户或其所属队伍，用于高亮 */
  isSelf: boolean
}

// --- 服务端接口数据结构（与 server-go internal/types/activity.go 对应） ---
//
// 服务端把判定规则拆成 specialRule（枚举）+ specialRuleLabel（文案）两个平铺字段，
// 前端组件消费的是嵌套的 SpecialRule 对象，因此在 store 的 mapper 里做一次转换。

/** 服务端下发的格子定义 */
export interface ServerTile {
  index: number
  title: string
  taskType: TileTaskType
  target: number
  unit: string
  specialRule?: SpecialRuleKind
  specialRuleLabel?: string
}

/** 服务端下发的书目，AI 结论为平铺字段 */
export interface ServerBook {
  id: string
  checkInId: string
  memberId: string
  memberName: string
  teamId: string
  teamName?: string
  tileIndex: number
  lap: number
  title: string
  author: string
  wordCount: number
  durationMinutes?: number
  coverUrl?: string
  genre?: string
  note?: string
  reviewStatus: ReviewStatus
  countsForTask: boolean
  aiStatus?: AiVerdict['status']
  aiConfidence?: number
  aiReason?: string
  evidenceUrl?: string
  createdAt: string
}

/** 服务端下发的打卡 */
export interface ServerCheckIn {
  id: string
  tileIndex: number
  teamId: string
  memberId: string
  memberName: string
  lap: number
  books: ServerBook[]
  evidenceUrl?: string
  createdAt: string
}

/** 服务端下发的判定会话 */
export interface ServerJudgement {
  tileIndex: number
  rule: SpecialRuleKind
  ruleLabel: string
  round: number
  rolls: Record<string, number>
  result?: 'passed' | 'failed'
}

/** 棋盘全局快照 */
export interface BoardSnapshot {
  tiles: ServerTile[]
  teams: Team[]
  /** 为空表示当前用户不在任何小组，只能观战 */
  myTeamId?: string
  myMemberId?: string
  isCaptain: boolean
  /** 当前用户是否已报名活动（报名是入队的前提） */
  enrolled: boolean
  /** 当前用户的活动昵称；空表示沿用账号昵称 */
  myNickname?: string
  /** 活动周期已结束，页面转只读归档态（P1-7 / 验收标准 12） */
  archived: boolean
  cycleStarted: boolean
  cycleStart: string
  cycleEnd: string
  /** 保底阈值由服务端下发，避免前端硬编码 */
  fallbackThreshold: number
}

/** 掷骰结果，点数由服务端生成 */
export interface RollResult {
  value: number
  fromTile: number
  toTile: number
  /** 本次掷骰点亮的格子编号，缺省表示未点亮 */
  litTile?: number
  litReason?: LitReason
  /** 落入第 8 格启动计时（P1-6） */
  timerStarted: boolean
  team: Team
}

/** 提交打卡时的单条书目草稿 */
export interface CheckInDraftBook {
  title: string
  author: string
  wordCount: number
  durationMinutes?: number
  coverUrl?: string
  genre?: string
  note?: string
}

/** 格子内某队某轮的打卡记录（PRD 8.2） */
export interface TileRecord {
  teamId: string
  teamName: string
  teamColor: string
  lap: number
  bookCount: number
  lit: boolean
  litReason?: LitReason
  isMyTeam: boolean
  /** 仅本组可见完整书目清单，其他组只有汇总数量 */
  books?: ServerBook[]
}

export interface TileDetail {
  tile: ServerTile
  records: TileRecord[]
}

/** 第 20 格候选书库条目 */
export interface BookLibraryItem {
  id: string
  title: string
  author: string
  wordCount: number
  coverUrl?: string
  memberName: string
  teamName?: string
}

/** 人工终审队列项（PRD 9.3） */
export interface ReviewQueueItem {
  book: ServerBook
  /** 该成员历史通过率，供管理员参考 */
  memberPassRate: number
  /** 该书目是否被本队重复提交 */
  duplicateInTeam: boolean
  tile: ServerTile
}

/** 队长投票池条目。审核池对全员可见（只读），仅队长可投票。 */
export interface VotePoolItem {
  book: ServerBook
  tile: ServerTile
  /** 当前赞成 / 反对票数 */
  yesCount: number
  noCount: number
  /** 当前活动内队长总数，赞成过半即通过 */
  totalCaptains: number
  /** 当前用户已投的票：approve / reject，未投为空 */
  myVote?: 'approve' | 'reject'
  /** 本次操作是否使该条目出池（通过） */
  resolved?: boolean
}

/** 成员单次打卡（已通过），用于成员档案 */
export interface MemberCheckInItem {
  checkInId: string
  tileIndex: number
  lap: number
  createdAt: string
  books: ServerBook[]
  likeCount: number
  likedByMe: boolean
}

/** 成员阅读档案（点击「全部队伍」中的成员查看），仅统计已通过审核的打卡 */
export interface MemberProfile {
  memberId: string
  memberName: string
  teamId: string
  teamName?: string
  bookCount: number
  wordCount: number
  /** 总时长（分钟），展示层换算小时 */
  durationMinutes: number
  checkIns: MemberCheckInItem[]
}

/** 报名名单条目（队长可见）：已报名人员及其入队状态 */
export interface EnrollmentItem {
  id: string
  userId: string
  name: string
  avatarUrl?: string
  /** 已入队时的队伍；空表示待入队 */
  teamId?: string
  teamName?: string
  joined: boolean
}
