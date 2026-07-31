import jwt from 'jsonwebtoken'
import type { AuthUser } from '../types.js'

// 生产环境必须显式配置 JWT_SECRET，缺失时直接启动失败，避免静默使用弱密钥
// 开发环境保留默认值方便本地调试
const SECRET = (() => {
  const secret = process.env.JWT_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 JWT_SECRET 环境变量（至少 32 位随机字符串）')
  }
  return 'dev-secret-change-me'
})()

// Access token：短期，用于 API 认证
const ACCESS_EXPIRES_IN = '15m'
// Refresh token：长期，仅用于换取新的 access token
const REFRESH_EXPIRES_IN = '7d'

// 签发 access token（短期）
export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, SECRET, { expiresIn: ACCESS_EXPIRES_IN })
}

// 签发 refresh token（长期）
export function signRefreshToken(payload: AuthUser): string {
  return jwt.sign({ ...payload, type: 'refresh' }, SECRET, { expiresIn: REFRESH_EXPIRES_IN })
}

// 验证 access token，失败返回 null
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, SECRET) as AuthUser & { type?: string }
    // refresh token 不能当作 access token 使用
    if (payload.type === 'refresh') return null
    return { userId: payload.userId, username: payload.username }
  } catch {
    return null
  }
}

// 验证 refresh token，失败返回 null
export function verifyRefreshToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, SECRET) as AuthUser & { type?: string }
    if (payload.type !== 'refresh') return null
    return { userId: payload.userId, username: payload.username }
  } catch {
    return null
  }
}
