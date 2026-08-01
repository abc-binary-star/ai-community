import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../db.js'
import { mapComment } from '../lib/mappers.js'
import { createNotification } from '../lib/notification.js'
import { isUniqueConstraintError } from '../lib/prisma-error.js'
import { parsePagination } from '../lib/pagination.js'
import { authMiddleware, optionalAuthMiddleware, getCurrentUserId } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { Comment, Paginated } from 'shared'

const comment = new Hono<AppEnv>()

const createSchema = z.object({
  content: z.string().min(1, '评论内容不能为空').max(5000, '评论内容过长'),
  parentId: z.string().cuid().optional(),
})

// 批量查询当前用户对一组评论的点赞状态
async function getLikedCommentIds(commentIds: string[], userId?: string): Promise<Set<string>> {
  if (!userId || commentIds.length === 0) return new Set()
  const rows = await prisma.commentLike.findMany({
    where: { commentId: { in: commentIds }, userId },
    select: { commentId: true },
  })
  return new Set(rows.map((r) => r.commentId))
}

// 收集一棵评论树里所有评论的 id（递归）
function collectIds(nodes: Comment[]): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    ids.push(n.id)
    if (n.replies.length > 0) ids.push(...collectIds(n.replies))
  }
  return ids
}

// 给一棵评论树批量打上 liked 标记
function markLiked(nodes: Comment[], likedSet: Set<string>): void {
  for (const n of nodes) {
    n.liked = likedSet.has(n.id)
    if (n.replies.length > 0) markLiked(n.replies, likedSet)
  }
}

// 获取帖子的评论列表（树形，分页根评论）
// GET /api/posts/:id/comments
comment.get('/posts/:id/comments', optionalAuthMiddleware, async (c) => {
  const postId = c.req.param('id') as string
  const currentUserId = getCurrentUserId(c)
  const { page, pageSize } = parsePagination(c)

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  // 根评论总数
  const total = await prisma.comment.count({ where: { postId, parentId: null } })

  // 分页加载根评论（倒序，最新在前）
  const rootRows = await prisma.comment.findMany({
    where: { postId, parentId: null },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  // 全量加载回复（因为要组装树）
  const replyRows = await prisma.comment.findMany({
    where: { postId, parentId: { not: null } },
    include: { author: true },
    orderBy: { createdAt: 'asc' },
  })

  const allRows = [...rootRows, ...replyRows]
  const nodes = new Map<string, Comment>()
  for (const r of allRows) {
    nodes.set(r.id, { ...mapComment(r), replies: [] })
  }

  const roots: Comment[] = []
  for (const r of allRows) {
    const node = nodes.get(r.id)!
    if (r.parentId && nodes.has(r.parentId)) {
      nodes.get(r.parentId)!.replies.push(node)
    } else if (!r.parentId) {
      roots.push(node)
    }
    // parentId 不为 null 但父评论不在当前页 -> 跳过（属于其他页的根评论的回复）
  }
  // DB 已按 createdAt desc 返回，无需内存排序

  // 批量查询当前用户的点赞状态并打标
  const allIds = collectIds(roots)
  const likedSet = await getLikedCommentIds(allIds, currentUserId)
  markLiked(roots, likedSet)

  const result: Paginated<Comment> = {
    items: roots,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  }
  return c.json(result)
})

// 创建评论或回复
// POST /api/posts/:id/comments
comment.post('/posts/:id/comments', authMiddleware, async (c) => {
  const postId = c.req.param('id') as string
  const userId = c.get('user')!.userId
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }
  const { content, parentId } = parsed.data

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true } })
  if (!post) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  // 若指定父评论，校验其属于同一帖子，并取出其作者用于回复通知
  let parentAuthorId: string | null = null
  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { postId: true, authorId: true } })
    if (!parent || parent.postId !== postId) {
      return c.json({ error: '父评论不存在或不属于该帖子' }, 400)
    }
    parentAuthorId = parent.authorId
  }

  const created = await prisma.comment.create({
    data: { content, postId, authorId: userId, parentId: parentId ?? null },
    include: { author: true },
  })

  // 异步产生通知（不阻塞响应）：
  // - 回复评论：通知被回复者（type=reply）
  // - 普通评论：通知帖子作者（type=comment）
  if (parentId && parentAuthorId) {
    await createNotification({
      userId: parentAuthorId,
      type: 'reply',
      actorId: userId,
      postId,
      commentId: created.id,
      content: content.length > 50 ? content.slice(0, 50) + '…' : content,
    })
  } else {
    await createNotification({
      userId: post.authorId,
      type: 'comment',
      actorId: userId,
      postId,
      commentId: created.id,
      content: content.length > 50 ? content.slice(0, 50) + '…' : content,
    })
  }

  return c.json({ ...mapComment(created), liked: false }, 201)
})

// 删除评论（仅作者；级联删除其回复和点赞）
// DELETE /api/comments/:id
comment.delete('/comments/:id', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user')!.userId

  const existing = await prisma.comment.findUnique({ where: { id }, select: { authorId: true } })
  if (!existing) {
    return c.json({ error: '评论不存在' }, 404)
  }
  if (existing.authorId !== userId) {
    return c.json({ error: '无权删除他人的评论' }, 403)
  }

  await prisma.comment.delete({ where: { id } })
  return c.json({ ok: true })
})

// 点赞评论
// POST /api/comments/:id/like
comment.post('/comments/:id/like', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user')!.userId

  const existing = await prisma.comment.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return c.json({ error: '评论不存在' }, 404)
  }

  const already = await prisma.commentLike.findUnique({ where: { commentId_userId: { commentId: id, userId } } })
  if (already) {
    const c2 = await prisma.comment.findUnique({ where: { id }, select: { likeCount: true } })
    return c.json({ ok: true, liked: true, likeCount: c2?.likeCount ?? 0 })
  }

  // 捕获并发下的唯一约束冲突（P2002），当作「已点赞」处理
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.commentLike.create({ data: { commentId: id, userId } })
      return tx.comment.update({ where: { id }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } })
    })
    return c.json({ ok: true, liked: true, likeCount: updated.likeCount }, 201)
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      const c2 = await prisma.comment.findUnique({ where: { id }, select: { likeCount: true } })
      return c.json({ ok: true, liked: true, likeCount: c2?.likeCount ?? 0 })
    }
    throw e
  }
})

// 取消点赞评论
// DELETE /api/comments/:id/like
comment.delete('/comments/:id/like', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user')!.userId

  const existing = await prisma.comment.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return c.json({ error: '评论不存在' }, 404)
  }

  // 用 deleteMany 代替 delete：并发下零匹配不报 P2025，根据 count 决定是否减计数
  const result = await prisma.commentLike.deleteMany({
    where: { commentId: id, userId },
  })

  if (result.count === 0) {
    const c2 = await prisma.comment.findUnique({ where: { id }, select: { likeCount: true } })
    return c.json({ ok: true, liked: false, likeCount: c2?.likeCount ?? 0 })
  }

  // 用 updateMany + gt:0 条件防止 likeCount 减为负数
  await prisma.comment.updateMany({
    where: { id, likeCount: { gt: 0 } },
    data: { likeCount: { decrement: 1 } },
  })
  const c2 = await prisma.comment.findUnique({ where: { id }, select: { likeCount: true } })
  return c.json({ ok: true, liked: false, likeCount: c2?.likeCount ?? 0 })
})

export default comment
