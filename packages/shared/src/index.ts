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
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
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

