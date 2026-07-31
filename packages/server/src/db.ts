import { PrismaClient } from '@prisma/client'

// PrismaClient 单例：避免 dev 模式热重载时反复新建连接池
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
