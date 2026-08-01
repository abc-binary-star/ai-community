import type { Context } from 'hono'
import type { AppEnv } from '../types.js'

// 从 query 参数解析分页参数，统一处理边界和取整。
// page 默认 1，pageSize 默认 20，pageSize 上限 50。
export function parsePagination(c: Context<AppEnv>): { page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(Number(c.req.query('page')) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query('pageSize')) || 20)))
  return { page, pageSize }
}
