import { Hono } from 'hono'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { mapPost } from '../lib/mappers.js'
import { createNotification } from '../lib/notification.js'
import { getLikedPostIds, getBookmarkedPostIds, extractTags } from '../lib/post-helpers.js'
import { isUniqueConstraintError } from '../lib/prisma-error.js'
import { authMiddleware, optionalAuthMiddleware, getCurrentUserId } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { Paginated, Post } from 'shared'

const post = new Hono<AppEnv>()

const channelEnum = z.enum(['general', 'tech', 'design', 'gaming', 'life'])

const createSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100, '标题最多 100 字'),
  content: z.string().min(1, '内容不能为空').max(20000, '内容过长'),
  channel: channelEnum.optional(),
  tags: z.array(z.string().trim().max(20)).max(5, '最多 5 个标签').optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(20000).optional(),
})

// 帖子列表
post.use('/', optionalAuthMiddleware)
post.get('/', async (c) => {
  const channel = c.req.query('channel') || 'general'
  const page = Math.max(1, Math.floor(Number(c.req.query('page')) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query('pageSize')) || 20)))
  const sort = c.req.query('sort') || 'latest'
  const q = c.req.query('q') || ''
  const tag = c.req.query('tag') || ''
  const currentUserId = getCurrentUserId(c)

  const where: Prisma.PostWhereInput = {}
  // 有搜索关键词时跨频道搜索，否则按频道过滤
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
    ]
  } else if (channel && channel !== 'all') {
    where.channel = channel
  }
  if (tag) {
    where.tags = {
      some: {
        tag: { name: tag },
      },
    }
  }

  // 获取所有匹配帖子（不过滤分页），用于热排序
  const include = {
    author: true,
    tags: { include: { tag: true } },
    _count: { select: { comments: true, likes: true } },
  }

  let rows: any[] = []
  let total: number = 0

  if (sort === 'hot') {
    // 热排序：先拉全量（加上限避免内存溢出），内存排序后分页
    const allRows = await prisma.post.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' }, // 先按时间拉，保证稳定
      take: 500,
    })
    // 加权排序：likeCount * 2 + commentCount * 3
    allRows.sort((a, b) => {
      const scoreB = b._count.likes * 2 + b._count.comments * 3
      const scoreA = a._count.likes * 2 + a._count.comments * 3
      if (scoreB !== scoreA) return scoreB - scoreA
      // 同分按时间倒序
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
    total = allRows.length
    const start = (page - 1) * pageSize
    rows = allRows.slice(start, start + pageSize)
  } else {
    ;[rows, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ])
  }

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

// 帖子详情（浏览量 +1）
post.use('/:id', optionalAuthMiddleware)
post.get('/:id', async (c) => {
  const id = c.req.param('id') as string
  const currentUserId = getCurrentUserId(c)

  // 用 updateMany 代替 findUnique + update 事务：如果帖子不存在返回 count=0 则 404，
  // 否则再 findUnique 获取完整数据，避免先查再更新的事务开销
  const updateResult = await prisma.post.updateMany({
    where: { id },
    data: { viewCount: { increment: 1 } },
  })

  if (updateResult.count === 0) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  const p = await prisma.post.findUnique({
    where: { id },
    include: { author: true, tags: { include: { tag: true } }, _count: { select: { comments: true } } },
  })

  if (!p) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  const liked = currentUserId
    ? !!(await prisma.postLike.findUnique({
        where: { postId_userId: { postId: id, userId: currentUserId } },
        select: { id: true },
      }))
    : false

  const bookmarked = currentUserId
    ? !!(await prisma.bookmark.findUnique({
        where: { postId_userId: { postId: id, userId: currentUserId } },
        select: { id: true },
      }))
    : false

  return c.json({
    ...mapPost(p),
    commentCount: p._count.comments,
    liked,
    bookmarked,
    tags: extractTags(p.tags),
  })
})

// 创建帖子（支持 tags）
post.post('/', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }
  const { title, content, channel, tags } = parsed.data
  const userId = c.get('user').userId

  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: { title, content, channel: channel || 'general', authorId: userId },
    })

    if (tags && tags.length > 0) {
      // 过滤空字符串 + 去掉 # 前缀 + 统一转小写 + 去重
      const tagNames = [...new Set(
        tags.filter((t) => t.length > 0).map((t) => t.replace(/^#+/, '').toLowerCase())
      )]
      for (const tagName of tagNames) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        })
        await tx.postTag.create({
          data: { postId: post.id, tagId: tag.id },
        })
      }
    }

    // 事务内一次性返回带 author/tags 的完整数据，避免事务外再查一次
    return tx.post.findUnique({
      where: { id: post.id },
      include: { author: true, tags: { include: { tag: true } } },
    })
  })

  if (!created) {
    return c.json({ error: '创建失败' }, 500)
  }

  return c.json(
    {
      ...mapPost(created),
      commentCount: 0,
      liked: false,
      bookmarked: false,
      tags: extractTags(created.tags),
    },
    201,
  )
})

// 更新帖子
post.put('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user').userId
  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }

  const existing = await prisma.post.findUnique({ where: { id } })
  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404)
  }
  if (existing.authorId !== userId) {
    return c.json({ error: '无权修改他人的帖子' }, 403)
  }

  const updated = await prisma.post.update({
    where: { id },
    data: { title: parsed.data.title, content: parsed.data.content },
    include: { author: true, tags: { include: { tag: true } }, _count: { select: { comments: true } } },
  })
  const liked = !!(await prisma.postLike.findUnique({ where: { postId_userId: { postId: id, userId } }, select: { id: true } }))
  const bookmarked = !!(await prisma.bookmark.findUnique({ where: { postId_userId: { postId: id, userId } }, select: { id: true } }))
  return c.json({
    ...mapPost(updated),
    commentCount: updated._count.comments,
    liked,
    bookmarked,
    tags: extractTags(updated.tags),
  })
})

// 删除帖子
post.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user').userId

  const existing = await prisma.post.findUnique({ where: { id } })
  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404)
  }
  if (existing.authorId !== userId) {
    return c.json({ error: '无权删除他人的帖子' }, 403)
  }

  await prisma.post.delete({ where: { id } })
  return c.json({ ok: true })
})

// 点赞帖子
post.post('/:id/like', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user').userId

  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true } })
  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  const already = await prisma.postLike.findUnique({ where: { postId_userId: { postId: id, userId } } })
  if (already) {
    const p = await prisma.post.findUnique({ where: { id }, select: { likeCount: true } })
    return c.json({ ok: true, liked: true, likeCount: p!.likeCount })
  }

  // 捕获并发下的唯一约束冲突（P2002），当作「已点赞」处理
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.postLike.create({ data: { postId: id, userId } })
      return tx.post.update({ where: { id }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } })
    })

    // 通知帖子作者被点赞
    await createNotification({
      userId: existing.authorId,
      type: 'like',
      actorId: userId,
      postId: id,
    })

    return c.json({ ok: true, liked: true, likeCount: updated.likeCount }, 201)
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      const p = await prisma.post.findUnique({ where: { id }, select: { likeCount: true } })
      return c.json({ ok: true, liked: true, likeCount: p!.likeCount })
    }
    throw e
  }
})

// 取消点赞帖子
post.delete('/:id/like', authMiddleware, async (c) => {
  const id = c.req.param('id') as string
  const userId = c.get('user').userId

  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return c.json({ error: '帖子不存在' }, 404)
  }

  // 用 deleteMany 代替 delete：并发下零匹配不报 P2025，根据 count 决定是否减计数
  const result = await prisma.postLike.deleteMany({
    where: { postId: id, userId },
  })

  if (result.count === 0) {
    // 并发下已被删除或本就未点赞，幂等返回当前计数
    const p = await prisma.post.findUnique({ where: { id }, select: { likeCount: true } })
    return c.json({ ok: true, liked: false, likeCount: p!.likeCount })
  }

  const updated = await prisma.post.update({
    where: { id },
    data: { likeCount: { decrement: 1 } },
    select: { likeCount: true },
  })
  return c.json({ ok: true, liked: false, likeCount: updated.likeCount })
})

// 热门标签（按帖子数排序）
// GET /api/posts/tags/popular
post.get('/tags/popular', async (c) => {
  const tags = await prisma.tag.findMany({
    include: {
      _count: { select: { posts: true } },
    },
    orderBy: {
      posts: { _count: 'desc' },
    },
    take: 20,
  })
  const items = tags
    .filter((t) => t._count.posts > 0)
    .map((t) => ({ name: t.name, postCount: t._count.posts }))
  return c.json({ items })
})

export default post
