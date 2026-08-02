import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { mapPost, mapAuthor } from '../lib/mappers.js'
import { getLikedPostIds, getBookmarkedPostIds, extractTags } from '../lib/post-helpers.js'
import { parsePagination } from '../lib/pagination.js'
import { optionalAuthMiddleware, getCurrentUserId } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import { CHANNELS } from 'shared'
import type { Paginated, Post } from 'shared'

const search = new Hono<AppEnv>()

const postInclude = {
  author: true,
  tags: { include: { tag: true } },
  _count: { select: { comments: true, likes: true } },
}

// 构建 createdAt 时间范围过滤条件
function buildDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined
  const range: Prisma.DateTimeFilter = {}
  if (from) range.gte = new Date(from)
  if (to) range.lte = new Date(to)
  return range
}

// 帖子搜索 where：title / content / author.username 命中关键词
function buildPostWhere(
  q: string,
  channel?: string,
  author?: string,
  from?: string,
  to?: string,
): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
      { author: { username: { contains: q, mode: 'insensitive' } } },
    ],
  }
  if (channel) where.channel = channel
  if (author) where.author = { username: { contains: author, mode: 'insensitive' } }
  const dateRange = buildDateRange(from, to)
  if (dateRange) where.createdAt = dateRange
  return where
}

// 评论搜索 where：content 命中关键词
function buildCommentWhere(q: string, from?: string, to?: string): Prisma.CommentWhereInput {
  const where: Prisma.CommentWhereInput = {
    content: { contains: q, mode: 'insensitive' },
  }
  const dateRange = buildDateRange(from, to)
  if (dateRange) where.createdAt = dateRange
  return where
}

// 用户搜索 where：username / displayName 命中关键词
function buildUserWhere(q: string, from?: string, to?: string): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    OR: [
      { username: { contains: q, mode: 'insensitive' } },
      { displayName: { contains: q, mode: 'insensitive' } },
    ],
  }
  const dateRange = buildDateRange(from, to)
  if (dateRange) where.createdAt = dateRange
  return where
}

// 将帖子行映射为带 liked/bookmarked 状态的响应格式
async function mapPostResults(rows: any[], currentUserId?: string): Promise<Post[]> {
  const likedIds = await getLikedPostIds(rows.map((r) => r.id), currentUserId)
  const bookmarkedIds = await getBookmarkedPostIds(rows.map((r) => r.id), currentUserId)
  return rows.map((p) => ({
    ...mapPost(p),
    commentCount: p._count.comments,
    liked: likedIds.has(p.id),
    bookmarked: bookmarkedIds.has(p.id),
    tags: extractTags(p.tags),
  }))
}

// 将评论行映射为带关联帖子信息的响应格式
function mapCommentResults(
  rows: Prisma.CommentGetPayload<{
    include: { author: true; post: { select: { id: true; title: true; channel: true } } }
  }>[],
) {
  return rows.map((c) => ({
    id: c.id,
    content: c.content,
    postId: c.postId,
    authorId: c.authorId,
    author: mapAuthor(c.author),
    post: { id: c.post.id, title: c.post.title, channel: c.post.channel },
    createdAt: c.createdAt.toISOString(),
    likeCount: c.likeCount,
  }))
}

// 将用户行映射为响应格式
function mapUserResults(
  rows: Prisma.UserGetPayload<{
    select: { id: true; username: true; avatar: true; displayName: true; bio: true; createdAt: true }
  }>[],
) {
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    displayName: u.displayName,
    bio: u.bio,
    createdAt: u.createdAt.toISOString(),
  }))
}

// 搜索
search.get('/', optionalAuthMiddleware, async (c) => {
  try {
    const q = (c.req.query('q') || '').trim()
    const rawScope = c.req.query('scope') || 'all'
    const scope: 'posts' | 'comments' | 'users' | 'all' =
      rawScope === 'posts' || rawScope === 'comments' || rawScope === 'users' ? rawScope : 'all'
    const channelParam = c.req.query('channel') || undefined
    const author = c.req.query('author') || undefined
    const from = c.req.query('from') || undefined
    const to = c.req.query('to') || undefined
    const sort = c.req.query('sort') || 'latest'
    const currentUserId = getCurrentUserId(c)

    // channel 仅在 scope=posts 或 all 时生效，且必须是合法频道
    const channel =
      (scope === 'posts' || scope === 'all') && channelParam && CHANNELS.includes(channelParam)
        ? channelParam
        : undefined

    // 空关键词返回空结果
    if (!q) {
      if (scope === 'all') {
        return c.json({
          posts: { items: [], total: 0 },
          comments: { items: [], total: 0 },
          users: { items: [], total: 0 },
        })
      }
      const { page, pageSize } = parsePagination(c)
      const empty: Paginated<never> = { items: [], total: 0, page, pageSize, totalPages: 0 }
      return c.json(empty)
    }

    // scope=all：并行查 posts/comments/users，各取前 5 条，返回各类型 total
    if (scope === 'all') {
      const postWhere = buildPostWhere(q, channel, author, from, to)
      const commentWhere = buildCommentWhere(q, from, to)
      const userWhere = buildUserWhere(q, from, to)

      const [postRows, postTotal, commentRows, commentTotal, userRows, userTotal] = await Promise.all([
        prisma.post.findMany({
          where: postWhere,
          include: postInclude,
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.post.count({ where: postWhere }),
        prisma.comment.findMany({
          where: commentWhere,
          include: { author: true, post: { select: { id: true, title: true, channel: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.comment.count({ where: commentWhere }),
        prisma.user.findMany({
          where: userWhere,
          select: { id: true, username: true, avatar: true, displayName: true, bio: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.user.count({ where: userWhere }),
      ])

      const [posts, comments, users] = await Promise.all([
        mapPostResults(postRows, currentUserId),
        Promise.resolve(mapCommentResults(commentRows)),
        Promise.resolve(mapUserResults(userRows)),
      ])

      return c.json({
        posts: { items: posts, total: postTotal },
        comments: { items: comments, total: commentTotal },
        users: { items: users, total: userTotal },
      })
    }

    // 单一 scope：分页查询
    const { page, pageSize } = parsePagination(c)

    if (scope === 'posts') {
      const where = buildPostWhere(q, channel, author, from, to)
      let rows: any[] = []
      let total = 0

      if (sort === 'relevance') {
        // 相关度排序：拉取后内存排序，标题命中关键词的排前面，同组内按时间倒序
        const allRows = await prisma.post.findMany({
          where,
          include: postInclude,
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
        const ql = q.toLowerCase()
        allRows.sort((a, b) => {
          const aTitle = a.title.toLowerCase().includes(ql) ? 1 : 0
          const bTitle = b.title.toLowerCase().includes(ql) ? 1 : 0
          if (bTitle !== aTitle) return bTitle - aTitle
          return b.createdAt.getTime() - a.createdAt.getTime()
        })
        total = await prisma.post.count({ where })
        const start = (page - 1) * pageSize
        rows = allRows.slice(start, start + pageSize)
      } else {
        ;[rows, total] = await Promise.all([
          prisma.post.findMany({
            where,
            include: postInclude,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.post.count({ where }),
        ])
      }

      const items = await mapPostResults(rows, currentUserId)
      const result: Paginated<Post> = {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 0,
      }
      return c.json(result)
    }

    if (scope === 'comments') {
      const where = buildCommentWhere(q, from, to)
      const [rows, total] = await Promise.all([
        prisma.comment.findMany({
          where,
          include: { author: true, post: { select: { id: true, title: true, channel: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.comment.count({ where }),
      ])

      const items = mapCommentResults(rows)
      return c.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 0,
      })
    }

    // scope === 'users'
    {
      const where = buildUserWhere(q, from, to)
      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: { id: true, username: true, avatar: true, displayName: true, bio: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.user.count({ where }),
      ])

      const items = mapUserResults(rows)
      return c.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 0,
      })
    }
  } catch (e) {
    console.error('搜索失败:', e)
    return c.json({ error: '搜索失败' }, 500)
  }
})

export default search
