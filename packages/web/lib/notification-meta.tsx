import type { ReactNode } from 'react'
import { AtSign, Heart, MessageCircle, Reply, UserPlus } from 'lucide-react'
import type { Notification } from 'shared'

export const TYPE_ICON: Record<Notification['type'], ReactNode> = {
  comment: <MessageCircle className="size-4 text-sky-500" />,
  like: <Heart className="size-4 text-rose-500" />,
  follow: <UserPlus className="size-4 text-emerald-500" />,
  reply: <Reply className="size-4 text-amber-500" />,
  mention: <AtSign className="size-4 text-violet-500" />,
}

export const TYPE_LABEL: Record<Notification['type'], string> = {
  comment: '评论了你的帖子',
  like: '点赞了你的帖子',
  follow: '关注了你',
  reply: '回复了你的评论',
  mention: '在帖子中提及了你',
}

// 想法（批注）通知文案：与评论通知区分，需要知道是否带 annotationId
const ANNOTATION_LABEL: Partial<Record<Notification['type'], string>> = {
  comment: '评论了你的想法',
  like: '点赞了你的想法',
  reply: '回复了你的想法',
  mention: '在想法中提及了你',
}

export function notificationLabel(n: Notification): string {
  const label = n.annotationId ? ANNOTATION_LABEL[n.type] : undefined
  return label ?? TYPE_LABEL[n.type]
}
