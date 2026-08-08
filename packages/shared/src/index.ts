export interface User {
  id: string
  username: string
  email: string
  avatar: string | null
  bio: string | null
  displayName: string | null
  role: string
  createdAt: string
  updatedAt: string
}

export interface PublicUser {
  id: string
  username: string
  avatar: string | null
  bio: string | null
  displayName: string | null
  role: string
  postCount: number
  followerCount: number
  followingCount: number
  likeCount: number
  channels: string[]
  isFollowing: boolean
  createdAt: string
}

export interface Post {
  id: string
  title: string
  content: string
  channel: string
  status: 'published' | 'draft'
  authorId: string
  author: PublicUser
  commentCount: number
  likeCount: number
  viewCount: number
  liked: boolean
  bookmarked: boolean
  edited: boolean
  isPinned: boolean
  isFeatured: boolean
  aiSummary?: string
  font?: string
  coverUrl?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  content: string
  postId: string
  authorId: string
  author: PublicUser
  parentId: string | null
  replies: Comment[]
  replyCount: number
  likeCount: number
  liked: boolean
  edited: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  user: User
  token: string
  refreshToken: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface DiscoverResponse {
  hotPosts: Post[]
  trendingTags: { name: string; postCount: number }[]
  recommendedUsers: PublicUser[]
}

export interface Tag {
  id: string
  name: string
  postCount: number
}

export interface Notification {
  id: string
  type: 'comment' | 'like' | 'follow' | 'reply' | 'mention'
  actorId: string | null
  actorName: string | null
  postId: string | null
  commentId: string | null
  annotationId: string | null
  content: string | null
  read: boolean
  createdAt: string
}

export interface Report {
  id: string
  reporterId: string
  reporter: PublicUser
  targetType: 'post' | 'comment'
  targetId: string
  targetTitle: string
  targetBody: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  handledBy: string | null
  handler: PublicUser | null
  note: string
  createdAt: string
  updatedAt: string
}

export interface Channel {
  id: string
  name: string
  label: string
  description: string
  icon: string
  categoryId: string | null
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ChannelCategory {
  id: string
  name: string
  label: string
  icon: string
  sortOrder: number
  createdAt: string
}

export interface ChannelCategoryWithChannels extends ChannelCategory {
  channels: Channel[]
}

export interface ChannelTree {
  categories: ChannelCategoryWithChannels[]
  uncategorized: Channel[]
}

// 频道 fallback 默认值（API 不可用时使用）

export interface NotificationPreference {
  comment: boolean
  reply: boolean
  like: boolean
  follow: boolean
  mention: boolean
  doNotDisturb: boolean
  quietStartHour: number
  quietEndHour: number
}

export interface Conversation {
  id: string
  otherUser: PublicUser
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatar: string | null
  content: string
  readAt: string | null
  createdAt: string
}

export interface PostSummary {
  summary: string
  commentCount: number
  generatedAt: string
  eligible: boolean
}

export interface ThreadSummaryPoint {
  text: string
  commentId: string
}

export interface ThreadSummary {
  summary: string
  points: ThreadSummaryPoint[]
  status: 'done' | 'generating' | 'none'
  stale: boolean
  commentCount: number
  generatedAt: string
}

export const CHANNELS: string[] = ['general', 'tech', 'design', 'gaming', 'life']

export const CHANNEL_LABELS: Record<string, string> = {
  general: '综合讨论',
  tech: '技术前沿',
  design: '设计美学',
  gaming: '游戏天地',
  life: '生活方式',
}

// 根据 API 返回的频道列表获取频道显示名称，fallback 到 CHANNEL_LABELS
export function getChannelLabel(channels: Channel[] | undefined, name: string): string {
  const ch = channels?.find((c) => c.name === name)
  if (ch) return ch.label
  return CHANNEL_LABELS[name] || name
}

export interface BookmarkFolder {
  id: string
  name: string
  createdAt: string
}

export interface FollowGroup {
  id: string
  name: string
  createdAt: string
}


// 帖子划线高亮
export interface Highlight {
  id: string
  anchor: string
  startOffset: number
  endOffset: number
  selectedText: string
  color: string
  createdAt: string
}

/**
 * 整篇想法的固定锚点值，必须与后端 model.AnnotationWholeAnchor 保持一致。
 * 整篇想法承接原帖底部评论，不绑定任何具体段落。
 */
export const WHOLE_ANNOTATION_ANCHOR = '__whole__'

// 段落想法（批注）
export interface Annotation {
  id: string
  postId: string
  authorId: string
  author: PublicUser
  scope: 'selection' | 'paragraph' | 'whole'
  anchor: string
  startOffset: number
  endOffset: number
  selectedText: string
  prefix: string
  suffix: string
  paragraphSnapshot: string
  body: string
  visibility: 'public' | 'private'
  anchorStatus: 'attached' | 'orphaned'
  status: 'active' | 'deleted' | 'moderated'
  edited: boolean
  replyCount: number
  likeCount: number
  liked: boolean
  folded: boolean
  replies: AnnotationReply[]
  createdAt: string
  updatedAt: string
}

export interface AnnotationReply {
  id: string
  annotationId: string
  authorId: string
  author: PublicUser
  replyToUserId?: string
  body: string
  status: 'active' | 'deleted' | 'moderated'
  edited: boolean
  folded: boolean
  createdAt: string
  updatedAt: string
}

export interface AnnotationAnchorCount {
  anchor: string
  count: number
}

export interface AnnotationList {
  items: Annotation[]
  anchorCounts: AnnotationAnchorCount[]
  total: number
}

// --- 想法流（跨帖分发）---

/** 想法卡携带的来源帖子。任何形态的卡都必须带上它，不存在无来源的卡 */
export interface IdeaCardPost {
  id: string
  title: string
  author: PublicUser
  channel: string
  coverUrl?: string
}

/**
 * 想法流中的一张卡。
 * type 为 idea 时是真实的公开段落想法，body/author/互动计数有效；
 * 为 excerpt 时是系统抽取的关键句，无人声、不可互动。
 */
export interface IdeaCard {
  type: 'idea' | 'excerpt'
  id: string
  excerpt: string
  anchor: string
  post: IdeaCardPost
  body?: string
  author?: PublicUser
  scope?: 'selection' | 'paragraph'
  replyCount: number
  likeCount: number
  liked: boolean
  createdAt?: string
}

export interface IdeaFeed {
  items: IdeaCard[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** 本页想法卡数量 */
  ideaCount: number
  /** 本页摘录卡数量，用于观察人声替换进度 */
  filledCount: number
}

// --- 想法链（纵向链视图）---

/** 想法链上的一个节点 */
export interface IdeaChainNode {
  id: string
  excerpt: string
  anchor: string
  body: string
  author?: PublicUser
  scope: 'selection' | 'paragraph' | 'whole'
  replyCount: number
  likeCount: number
  createdAt: string
}

/**
 * 想法链视图：一次只呈现一条纵向路径。
 * parent 是它回应的想法（上方），current 是它自己（中间），
 * children 是由它引出的想法（下方，引用边），siblings 是同段落的其他声音（共位边）。
 */
export interface IdeaChain {
  post: IdeaCardPost
  parent?: IdeaChainNode
  current: IdeaChainNode
  children: IdeaChainNode[]
  siblings: IdeaChainNode[]
  /** 语义相近的想法（近邻边，向量检索；未启用时为空数组） */
  neighbors: IdeaChainNode[]
}

// --- 官方公告 ---

export type AnnouncementCategory = 'moderation' | 'rule' | 'feature' | 'maintenance' | 'activity'
export type AnnouncementLevel = 'urgent' | 'important' | 'normal'
export type AnnouncementStatus = 'draft' | 'published' | 'offline'

export interface PenaltyItem {
  username: string
  reason: string
  action: string
  date?: string
}

export interface AnnouncementSummary {
  id: string
  title: string
  category: AnnouncementCategory
  level: AnnouncementLevel
  status: AnnouncementStatus
  isPinned: boolean
  publishAt: string
  expireAt: string | null
  edited: boolean
  isRead: boolean
  authorId: string
  author: PublicUser
  createdAt: string
  updatedAt: string
}

export interface Announcement extends AnnouncementSummary {
  content: string
  penaltyList: PenaltyItem[]
}

export interface AnnouncementBanner {
  item: AnnouncementSummary | null
}
