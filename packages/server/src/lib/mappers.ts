import { Prisma } from '@prisma/client'
import type { Comment, Post, User, PublicUser } from 'shared'

type UserPayload = Prisma.UserGetPayload<{}>
type PostWithAuthor = Prisma.PostGetPayload<{ include: { author: true } }>
type CommentWithAuthor = Prisma.CommentGetPayload<{ include: { author: true } }>

export function mapUser(u: UserPayload): User {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    avatar: u.avatar,
    bio: u.bio,
    displayName: u.displayName,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }
}

export function mapPublicUser(
  u: UserPayload,
  postCount: number,
  followerCount: number,
  followingCount: number,
  isFollowing: boolean,
): PublicUser {
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    displayName: u.displayName,
    postCount,
    followerCount,
    followingCount,
    isFollowing,
    createdAt: u.createdAt.toISOString(),
  }
}

export function mapPost(p: PostWithAuthor): Post {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    channel: p.channel,
    authorId: p.authorId,
    author: mapUser(p.author),
    commentCount: 0,
    likeCount: p.likeCount,
    viewCount: p.viewCount,
    liked: false,
    bookmarked: false,
    tags: [],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export function mapComment(c: CommentWithAuthor): Comment {
  return {
    id: c.id,
    content: c.content,
    postId: c.postId,
    authorId: c.authorId,
    author: mapUser(c.author),
    parentId: c.parentId,
    replies: [],
    likeCount: c.likeCount,
    liked: false,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}
