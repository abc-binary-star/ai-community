import type { Context, Next } from 'hono'
import { verifyToken } from '../lib/jwt.js'
import type { AppEnv } from '../types.js'

// JWT 强制验证中间件：从 Authorization: Bearer xxx 提取 token，
// 验证后把 { userId, username } 挂到 context 的 user 变量上。
// 未带 token 或 token 无效时返回 401 { error: '未登录' }
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return c.json({ error: '未登录' }, 401)
  }
  const payload = verifyToken(match[1])
  if (!payload) {
    return c.json({ error: '未登录或登录已过期' }, 401)
  }
  c.set('user', payload)
  await next()
}

// 可选鉴权中间件：有 token 则解析并挂到 context，无 token 或无效也放行（user 为 undefined）
// 用于 GET 帖子/评论列表等公开接口，需要根据登录态返回 liked 字段
export async function optionalAuthMiddleware(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (match) {
    const payload = verifyToken(match[1])
    if (payload) {
      c.set('user', payload)
    }
  }
  await next()
}

// 从 context 提取当前 userId（可能为 undefined，表示未登录）
export function getCurrentUserId(c: Context<AppEnv>): string | undefined {
  return c.get('user')?.userId
}
