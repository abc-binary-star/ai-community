import { prisma } from '../db.js'

// 通知类型：与 shared 的 Notification['type'] 保持一致
export type NotificationType = 'comment' | 'like' | 'follow' | 'reply' | 'mention'

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
    // 对于 like/follow 类型，检查是否已存在相同的通知（取消后再操作不应重复创建）
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

// 从文本中解析 @username 提及
// 匹配 @ 后跟 2-20 个字母、数字、下划线或中文字符
const MENTION_REGEX = /@([a-zA-Z0-9_\u4e00-\u9fff]{2,20})/g

export function parseMentions(content: string): string[] {
  const matches = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    matches.add(match[1])
  }
  return [...matches]
}

// 解析内容中的 @提及并为每个被提及的用户创建 mention 通知
export async function createMentionNotifications(
  content: string,
  actorId: string,
  postId: string,
  commentId?: string,
): Promise<void> {
  const usernames = parseMentions(content)
  if (usernames.length === 0) return

  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  })

  for (const u of users) {
    await createNotification({
      userId: u.id,
      type: 'mention',
      actorId,
      postId,
      commentId,
      content: content.length > 50 ? content.slice(0, 50) + '…' : content,
    })
  }
}
