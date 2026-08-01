import { prisma } from '../db.js'

// 通知类型：与 shared 的 Notification['type'] 保持一致
export type NotificationType = 'comment' | 'like' | 'follow' | 'reply'

interface CreateNotificationInput {
  // 通知接收者（被动作触发的用户）
  userId: string
  type: NotificationType
  // 触发动作的用户（可能为 null，例如系统通知）
  actorId?: string
  // 关联帖子（评论/点赞帖子时）
  postId?: string
  // 关联评论（回复评论时）
  commentId?: string
  // 通知摘要内容
  content?: string
}

// 创建一条通知。
// - 跳过「自己给自己产生通知」的情况（actorId === userId）
// - 对于 like 类型，先查是否已存在同 actorId+postId+type 的通知，存在则跳过（防重复）
// - 失败时仅记日志，不阻断主流程（通知是副作用，不应让业务请求失败）
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  // 自己触发的不通知自己
  if (input.actorId && input.actorId === input.userId) return

  try {
    // 对于 like 和 follow 类型，检查是否已存在相同的通知（防重复）
    // - like: 取消点赞后再点赞不应重复创建
    // - follow: 取关后再关注不应重复创建
    if ((input.type === 'like' || input.type === 'follow') && input.actorId) {
      const where: { userId: string; actorId: string; type: string; postId?: string } = {
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
      }
      if (input.postId) where.postId = input.postId
      const existing = await prisma.notification.findFirst({ where, select: { id: true } })
      if (existing) return
    }

    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        actorId: input.actorId ?? null,
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
        content: input.content ?? null,
      },
    })
  } catch (e) {
    // 通知创建失败不应影响主流程，仅记录错误
    console.error('创建通知失败:', e)
  }
}
