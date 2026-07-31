import { prisma } from '../db.js'

// 批量查询当前用户对一组帖子的点赞状态，返回已点赞的 postId 集合
export async function getLikedPostIds(postIds: string[], userId?: string): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set()
  const rows = await prisma.postLike.findMany({
    where: { postId: { in: postIds }, userId },
    select: { postId: true },
  })
  return new Set(rows.map((r) => r.postId))
}

// 批量查询当前用户对一组帖子的收藏状态，返回已收藏的 postId 集合
export async function getBookmarkedPostIds(postIds: string[], userId?: string): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set()
  const rows = await prisma.bookmark.findMany({
    where: { postId: { in: postIds }, userId },
    select: { postId: true },
  })
  return new Set(rows.map((r) => r.postId))
}

// 从 PostTag 关联中提取标签名数组
export function extractTags(postTags: { tag: { name: string } }[]): string[] {
  return postTags.map((pt) => pt.tag.name)
}
