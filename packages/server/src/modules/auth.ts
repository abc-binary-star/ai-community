import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { signToken } from '../lib/jwt.js'
import { mapUser } from '../lib/mappers.js'
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

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({ data: { username, email, password: hashed } })
  const token = signToken({ userId: user.id, username: user.username })
  const data: AuthResponse = { user: mapUser(user), token }
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
    return c.json({ error: '邮箱或密码错误' }, 401)
  }
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) {
    return c.json({ error: '邮箱或密码错误' }, 401)
  }

  const token = signToken({ userId: user.id, username: user.username })
  const data: AuthResponse = { user: mapUser(user), token }
  return c.json(data)
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
