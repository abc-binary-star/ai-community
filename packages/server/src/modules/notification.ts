import { Hono } from 'hono'
import { prisma } from '../db.js'
import { parsePagination } from '../lib/pagination.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { Notification as NotificationType, Paginated } from 'shared'

const notification = new Hono<AppEnv>()

function mapNotification(
  n: any,
  actorMap: Map<string | null, string | null>,
): NotificationType {
  return {
    id: n.id,
    type: n.type as NotificationType['type'],
    actorId: n.actorId,
    actorName: actorMap.get(n.actorId) ?? null,
    postId: n.postId,
    commentId: n.commentId,
    content: n.content,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }
}

// 获取当前用户的通知列表
// GET /api/notifications
notification.get('/notifications', authMiddleware, async (c) => {
  const userId = c.get('user')!.userId
  const { page, pageSize } = parsePagination(c)

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
  ])

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[]
  const actorMap = new Map<string | null, string | null>()
  if (actorIds.length > 0) {
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, username: true },
    })
    for (const a of actors) {
      actorMap.set(a.id, a.username)
    }
  }

  const items: NotificationType[] = rows.map((r) => mapNotification(r, actorMap))

  const result: Paginated<NotificationType> = {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  }
  return c.json(result)
})

// 获取未读通知数量
// GET /api/notifications/unread-count
notification.get('/notifications/unread-count', authMiddleware, async (c) => {
  const userId = c.get('user')!.userId
  const count = await prisma.notification.count({
    where: { userId, read: false },
  })
  return c.json({ count })
})

// 标记单条通知为已读
// POST /api/notifications/:id/read
notification.post('/notifications/:id/read', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user')!.userId

  const existing = await prisma.notification.findUnique({ where: { id }, select: { userId: true } })
  if (!existing) {
    return c.json({ error: '通知不存在' }, 404)
  }
  if (existing.userId !== userId) {
    return c.json({ error: '无权操作' }, 403)
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true },
  })
  return c.json({ ok: true, read: updated.read })
})

// 全部标记为已读
// POST /api/notifications/read-all
notification.post('/notifications/read-all', authMiddleware, async (c) => {
  const userId = c.get('user')!.userId

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  })
  return c.json({ ok: true })
})

export default notification
