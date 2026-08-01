import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../db.js'
import { mapUser, mapPublicUser, mapPost } from '../lib/mappers.js'
import { getLikedPostIds, getBookmarkedPostIds, extractTags } from '../lib/post-helpers.js'
import { parsePagination } from '../lib/pagination.js'
import { authMiddleware, optionalAuthMiddleware, getCurrentUserId } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { Paginated, Post } from 'shared'

const user = new Hono<AppEnv>()

const updateSchema = z.object({
  displayName: z.string().max(30).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  avatar: z.string().url('头像必须是有效的 URL').nullable().optional(),
})

// 查看用户主页（公开）
// GET /api/users/:username
user.use('/:username', optionalAuthMiddleware)
user.get('/:username', async (c) => {
  const username = c.req.param('username') as string
  const currentUserId = getCurrentUserId(c)

  const u = await prisma.user.findUnique({ where: { username } })
  if (!u) {
    return c.json({ error: '用户不存在' }, 404)
  }

  const [postCount, followerCount, followingCount, isFollowing] = await Promise.all([
    prisma.post.count({ where: { authorId: u.id } }),
    prisma.follow.count({ where: { followingId: u.id } }),
    prisma.follow.count({ where: { followerId: u.id } }),
    currentUserId
      ? !!(await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: u.id } },
          select: { id: true },
        }))
      : false,
  ])

  return c.json(mapPublicUser(u, postCount, followerCount, followingCount, isFollowing))
})

// 查看用户发的帖子
// GET /api/users/:username/posts
user.use('/:username/posts', optionalAuthMiddleware)
user.get('/:username/posts', async (c) => {
  const username = c.req.param('username') as string
  const { page, pageSize } = parsePagination(c)
  const currentUserId = getCurrentUserId(c)

  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!u) {
    return c.json({ error: '用户不存在' }, 404)
  }

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where: { authorId: u.id },
      include: { author: true, tags: { include: { tag: true } }, _count: { select: { comments: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.post.count({ where: { authorId: u.id } }),
  ])

  const likedIds = await getLikedPostIds(rows.map((r) => r.id), currentUserId)
  const bookmarkedIds = await getBookmarkedPostIds(rows.map((r) => r.id), currentUserId)

  const items: Post[] = rows.map((p) => ({
    ...mapPost(p),
    commentCount: p._count.comments,
    liked: likedIds.has(p.id),
    bookmarked: bookmarkedIds.has(p.id),
    tags: extractTags(p.tags),
  }))

  const result: Paginated<Post> = {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  }
  return c.json(result)
})

// 更新当前用户资料（需登录）
// PUT /api/users/me
user.put('/me', authMiddleware, async (c) => {
  const userId = c.get('user')!.userId
  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: parsed.data.displayName,
      bio: parsed.data.bio,
      avatar: parsed.data.avatar,
    },
  })

  return c.json(mapUser(updated))
})

export default user
