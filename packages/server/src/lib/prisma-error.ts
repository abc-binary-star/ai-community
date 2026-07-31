import { Prisma } from '@prisma/client'

// 判断是否为 Prisma 唯一约束冲突错误（P2002）
// 用于点赞/收藏等「先查再创建」场景的竞态兜底：并发下两个请求同时通过 already 检查，
// 第二个 create 会抛 P2002，调用方应将其当作「已存在」处理
export function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
}

// 判断是否为 Prisma 记录不存在错误（P2025）
// 用于「先查再删」场景的竞态兜底：并发下两个请求同时通过 already 检查，
// 第二个 delete 会抛 P2025，调用方应将其当作幂等成功处理
export function isNotFoundError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
}
