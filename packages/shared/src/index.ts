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
  isFollowing: boolean
  createdAt: string
}

export interface Post {
  id: string
  title: string
  content: string
  channel: string
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

export const CHANNELS: string[] = ['general', 'tech', 'design', 'gaming', 'life']

export const CHANNEL_LABELS: Record<string, string> = {
  general: '综合讨论',
  tech: '技术前沿',
  design: '设计美学',
  gaming: '游戏天地',
  life: '生活方式',
}
