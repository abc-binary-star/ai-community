import jwt from 'jsonwebtoken'
import type { AuthUser } from '../types.js'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
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
