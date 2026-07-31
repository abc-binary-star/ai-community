import { Hono } from 'hono'
import { prisma } from '../db.js'
import { mapPost } from '../lib/mappers.js'
import { getLikedPostIds, getBookmarkedPostIds, extractTags } from '../lib/post-helpers.js'
import { isUniqueConstraintError } from '../lib/prisma-error.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { Paginated, Post } from 'shared'

const bookmark = new Hono<AppEnv>()

// 收藏帖子
// POST /api/posts/:id/bookmark
bookmark.post('/posts/:id/bookmark', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user').userId

  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  const already = await prisma.bookmark.findUnique({
    where: { postId_userId: { postId: id, userId } },
  })
  if (already) {
    const count = await prisma.bookmark.count({ where: { postId: id } })
    return c.json({ ok: true, bookmarked: true, bookmarkCount: count })
  }

  // 捕获并发下的唯一约束冲突（P2002），当作「已收藏」处理
  try {
    await prisma.bookmark.create({ data: { postId: id, userId } })
  } catch (e) {
    if (!isUniqueConstraintError(e)) throw e
  }
  const count = await prisma.bookmark.count({ where: { postId: id } })
  return c.json({ ok: true, bookmarked: true, bookmarkCount: count }, 201)
})

// 取消收藏
// DELETE /api/posts/:id/bookmark
bookmark.delete('/posts/:id/bookmark', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user').userId

  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  const already = await prisma.bookmark.findUnique({
    where: { postId_userId: { postId: id, userId } },
  })
  if (!already) {
    const count = await prisma.bookmark.count({ where: { postId: id } })
    return c.json({ ok: true, bookmarked: false, bookmarkCount: count })
  }

  await prisma.bookmark.delete({
    where: { postId_userId: { postId: id, userId } },
  })
  const count = await prisma.bookmark.count({ where: { postId: id } })
  return c.json({ ok: true, bookmarked: false, bookmarkCount: count })
})

// 获取当前用户的收藏列表
// GET /api/bookmarks
bookmark.get('/bookmarks', authMiddleware, async (c) => {
  const userId = c.get('user').userId
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query('pageSize')) || 20))

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where: { bookmarks: { some: { userId } } },
      include: { author: true, tags: { include: { tag: true } }, _count: { select: { comments: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.post.count({ where: { bookmarks: { some: { userId } } } }),
  ])

  const likedIds = await getLikedPostIds(rows.map((r) => r.id), userId)
  const bookmarkedIds = await getBookmarkedPostIds(rows.map((r) => r.id), userId)

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

export default bookmark