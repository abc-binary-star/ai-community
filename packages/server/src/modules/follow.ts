import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { mapPublicUser } from '../lib/mappers.js'
import { createNotification } from '../lib/notification.js'
import { isUniqueConstraintError } from '../lib/prisma-error.js'
import { authMiddleware, optionalAuthMiddleware, getCurrentUserId } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { Paginated, PublicUser } from 'shared'

const follow = new Hono<AppEnv>()

type UserPayload = Prisma.UserGetPayload<{}>
type FollowWithUser = Prisma.FollowGetPayload<{ include: { following: true } }>
type FollowWithFollower = Prisma.FollowGetPayload<{ include: { follower: true } }>

// 批量计算一组用户的公开统计（postCount/followerCount/followingCount）+ 当前用户是否关注他们。
// 用 groupBy 聚合 count，用单次 findMany 查 isFollowing，消除 N+1 查询。
async function batchPublicUserStats(
  users: { id: string }[],
  currentUserId?: string,
): Promise<Map<string, { postCount: number; followerCount: number; followingCount: number; isFollowing: boolean }>> {
  const ids = users.map((u) => u.id)
  const result = new Map<string, { postCount: number; followerCount: number; followingCount: number; isFollowing: boolean }>()
  if (ids.length === 0) return result

  // 并行聚合三个 count（每个都是单次 groupBy 查询，而非 N 次 count）
  const [postGroups, followerGroups, followingGroups, followingRows] = await Promise.all([
    prisma.post.groupBy({ by: ['authorId'], where: { authorId: { in: ids } }, _count: { _all: true } }),
    prisma.follow.groupBy({ by: ['followingId'], where: { followingId: { in: ids } }, _count: { _all: true } }),
    prisma.follow.groupBy({ by: ['followerId'], where: { followerId: { in: ids } }, _count: { _all: true } }),
    // 当前用户对这批用户的关注关系：一次 findMany 取代 N 次 findUnique
    currentUserId
      ? prisma.follow.findMany({
          where: { followerId: currentUserId, followingId: { in: ids } },
          select: { followingId: true },
        })
      : [],
  ])

  const postMap = new Map(postGroups.map((g) => [g.authorId, g._count._all]))
  const followerMap = new Map(followerGroups.map((g) => [g.followingId, g._count._all]))
  const followingMap = new Map(followingGroups.map((g) => [g.followerId, g._count._all]))
  const followingSet = new Set(followingRows.map((r) => r.followingId))

  for (const id of ids) {
    result.set(id, {
      postCount: postMap.get(id) ?? 0,
      followerCount: followerMap.get(id) ?? 0,
      followingCount: followingMap.get(id) ?? 0,
      isFollowing: followingSet.has(id),
    })
  }
  return result
}

// 把一批用户 + 统计映射成 PublicUser[]
function toPublicUsers(users: UserPayload[], stats: Map<string, { postCount: number; followerCount: number; followingCount: number; isFollowing: boolean }>): PublicUser[] {
  return users.map((u) => {
    const s = stats.get(u.id) ?? { postCount: 0, followerCount: 0, followingCount: 0, isFollowing: false }
    return mapPublicUser(u, s.postCount, s.followerCount, s.followingCount, s.isFollowing)
  })
}

// 关注某用户
// POST /api/users/:username/follow
follow.post('/users/:username/follow', authMiddleware, async (c) => {
  const username = c.req.param('username') as string
  const followerId = c.get('user').userId

  const target = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!target) {
    return c.json({ error: '用户不存在' }, 404)
  }
  if (target.id === followerId) {
    return c.json({ error: '不能关注自己' }, 400)
  }

  const already = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId: target.id } },
  })
  if (already) {
    return c.json({ ok: true, isFollowing: true })
  }

  // 捕获并发下的唯一约束冲突（P2002），当作「已关注」处理
  try {
    await prisma.follow.create({ data: { followerId, followingId: target.id } })
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return c.json({ ok: true, isFollowing: true })
    }
    throw e
  }

  // 通知被关注者
  await createNotification({
    userId: target.id,
    type: 'follow',
    actorId: followerId,
  })

  return c.json({ ok: true, isFollowing: true }, 201)
})

// 取消关注
// DELETE /api/users/:username/follow
follow.delete('/users/:username/follow', authMiddleware, async (c) => {
  const username = c.req.param('username') as string
  const followerId = c.get('user').userId

  const target = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!target) {
    return c.json({ error: '用户不存在' }, 404)
  }

  // 用 deleteMany 代替 delete：并发下零匹配不报 P2025
  await prisma.follow.deleteMany({
    where: { followerId, followingId: target.id },
  })
  return c.json({ ok: true, isFollowing: false })
})

// 获取某用户的关注列表
// GET /api/following/:username
follow.get('/following/:username', optionalAuthMiddleware, async (c) => {
  const username = c.req.param('username') as string
  const currentUserId = getCurrentUserId(c)
  const page = Math.max(1, Math.floor(Number(c.req.query('page')) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query('pageSize')) || 20)))

  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!u) {
    return c.json({ error: '用户不存在' }, 404)
  }

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: u.id },
      include: { following: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.follow.count({ where: { followerId: u.id } }),
  ])

  const followingUsers = follows.map((f) => f.following)
  const stats = await batchPublicUserStats(followingUsers, currentUserId)
  const items = toPublicUsers(followingUsers, stats)

  const result: Paginated<PublicUser> = {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  }
  return c.json(result)
})

// 获取某用户的粉丝列表
// GET /api/followers/:username
follow.get('/followers/:username', optionalAuthMiddleware, async (c) => {
  const username = c.req.param('username') as string
  const currentUserId = getCurrentUserId(c)
  const page = Math.max(1, Math.floor(Number(c.req.query('page')) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query('pageSize')) || 20)))

  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!u) {
    return c.json({ error: '用户不存在' }, 404)
  }

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: u.id },
      include: { follower: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.follow.count({ where: { followingId: u.id } }),
  ])

  const followerUsers = follows.map((f) => f.follower)
  const stats = await batchPublicUserStats(followerUsers, currentUserId)
  const items = toPublicUsers(followerUsers, stats)

  const result: Paginated<PublicUser> = {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  }
  return c.json(result)
})

export default follow
