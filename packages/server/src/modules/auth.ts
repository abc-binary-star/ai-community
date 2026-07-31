import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { signToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { mapUser } from '../lib/mappers.js'
import { isUniqueConstraintError } from '../lib/prisma-error.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'
import type { AuthResponse } from 'shared'

const auth = new Hono<AppEnv>()

const registerSchema = z.object({
  username: z.string().min(2, '用户名至少 2 个字符').max(20, '用户名最多 20 个字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(64, '密码最多 64 位'),
})

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, '缺少 refreshToken'),
})

// 用于登录时序侧信道防御的固定 dummy hash，
// 当邮箱不存在时仍执行一次 bcrypt.compare 使响应时间一致
const DUMMY_HASH = '$2a$12$yi8g72mJ6IFwFohHyRY6..G3f1g.0g//x0qTfwxBrwTs912HKv86y'

// 注册
auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }
  const { username, email, password } = parsed.data

  const exist = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } })
  if (exist) {
    return c.json({ error: '用户名或邮箱已被注册' }, 409)
  }

  // bcrypt cost factor 12，兼顾安全与性能（现代推荐值）
  const hashed = await bcrypt.hash(password, 12)

  // 捕获并发注册同邮箱/用户名的唯一约束冲突（P2002），返回 409
  let user
  try {
    user = await prisma.user.create({ data: { username, email, password: hashed } })
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return c.json({ error: '用户名或邮箱已被注册' }, 409)
    }
    throw e
  }
  const payload = { userId: user.id, username: user.username }
  const data: AuthResponse = {
    user: mapUser(user),
    token: signToken(payload),
    refreshToken: signRefreshToken(payload),
  }
  return c.json(data, 201)
})

// 登录
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    // 邮箱不存在时仍执行一次 bcrypt.compare，消除响应时间差异（防邮箱枚举）
    await bcrypt.compare(password, DUMMY_HASH)
    return c.json({ error: '邮箱或密码错误' }, 401)
  }
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) {
    return c.json({ error: '邮箱或密码错误' }, 401)
  }

  const payload = { userId: user.id, username: user.username }
  const data: AuthResponse = {
    user: mapUser(user),
    token: signToken(payload),
    refreshToken: signRefreshToken(payload),
  }
  return c.json(data)
})

// 刷新 access token
// POST /api/auth/refresh
auth.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = refreshSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '输入不合法', details: parsed.error.flatten() }, 400)
  }

  const payload = verifyRefreshToken(parsed.data.refreshToken)
  if (!payload) {
    return c.json({ error: 'refreshToken 无效或已过期' }, 401)
  }

  // 确认用户仍然存在
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, username: true } })
  if (!user) {
    return c.json({ error: '用户不存在' }, 404)
  }

  return c.json({
    token: signToken({ userId: user.id, username: user.username }),
    refreshToken: signRefreshToken({ userId: user.id, username: user.username }),
  })
})

// 获取当前登录用户
auth.get('/me', authMiddleware, async (c) => {
  const user = await prisma.user.findUnique({ where: { id: c.get('user').userId } })
  if (!user) {
    return c.json({ error: '用户不存在' }, 404)
  }
  return c.json({ user: mapUser(user) })
})

export default auth
