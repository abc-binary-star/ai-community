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
const EXPIRES_IN = '7d'

// 签发 JWT
export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN })
}

// 验证 JWT，失败返回 null
export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, SECRET) as AuthUser
  } catch {
    return null
  }
}
