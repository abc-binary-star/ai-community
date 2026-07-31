import { Hono } from 'hono'
import { prisma } from '../db.js'
import { mapPublicUser } from '../lib/mappers.js'
import { authMiddleware, optionalAuthMiddleware, getCurrentUserId } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { PublicUser } from 'shared'

const follow = new Hono<AppEnv>()

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

  await prisma.follow.create({ data: { followerId, followingId: target.id } })
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

  const already = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId: target.id } },
  })
  if (!already) {
    return c.json({ ok: true, isFollowing: false })
  }

  await prisma.follow.delete({
    where: { followerId_followingId: { followerId, followingId: target.id } },
  })
  return c.json({ ok: true, isFollowing: false })
})

// 获取某用户的关注列表
// GET /api/following/:username
follow.get('/following/:username', optionalAuthMiddleware, async (c) => {
  const username = c.req.param('username') as string
  const currentUserId = getCurrentUserId(c)

  const u = await prisma.user.findUnique({ where: { username } })
  if (!u) {
    return c.json({ error: '用户不存在' }, 404)
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: u.id },
    include: { following: true },
    orderBy: { createdAt: 'desc' },
  })

  const items: PublicUser[] = await Promise.all(
    follows.map(async (f) => {
      const t = f.following
      const [postCount, followerCount, followingCount, isFollowing] = await Promise.all([
        prisma.post.count({ where: { authorId: t.id } }),
        prisma.follow.count({ where: { followingId: t.id } }),
        prisma.follow.count({ where: { followerId: t.id } }),
        currentUserId
          ? !!(await prisma.follow.findUnique({
              where: { followerId_followingId: { followerId: currentUserId, followingId: t.id } },
              select: { id: true },
            }))
          : false,
      ])
      return mapPublicUser(t, postCount, followerCount, followingCount, isFollowing)
    }),
  )

  return c.json({ items })
})

// 获取某用户的粉丝列表
// GET /api/followers/:username
follow.get('/followers/:username', optionalAuthMiddleware, async (c) => {
  const username = c.req.param('username') as string
  const currentUserId = getCurrentUserId(c)

  const u = await prisma.user.findUnique({ where: { username } })
  if (!u) {
    return c.json({ error: '用户不存在' }, 404)
  }

  const follows = await prisma.follow.findMany({
    where: { followingId: u.id },
    include: { follower: true },
    orderBy: { createdAt: 'desc' },
  })

  const items: PublicUser[] = await Promise.all(
    follows.map(async (f) => {
      const t = f.follower
      const [postCount, followerCount, followingCount, isFollowing] = await Promise.all([
        prisma.post.count({ where: { authorId: t.id } }),
        prisma.follow.count({ where: { followingId: t.id } }),
        prisma.follow.count({ where: { followerId: t.id } }),
        currentUserId
          ? !!(await prisma.follow.findUnique({
              where: { followerId_followingId: { followerId: currentUserId, followingId: t.id } },
              select: { id: true },
            }))
          : false,
      ])
      return mapPublicUser(t, postCount, followerCount, followingCount, isFollowing)
    }),
  )

  return c.json({ items })
})

export default follow