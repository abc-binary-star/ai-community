import type { ReactNode } from 'react'
import { Heart, MessageCircle, Reply, UserPlus } from 'lucide-react'
import type { Notification } from 'shared'

export const TYPE_ICON: Record<Notification['type'], ReactNode> = {
  comment: <MessageCircle className="size-4 text-sky-500" />,
  like: <Heart className="size-4 text-rose-500" />,
  follow: <UserPlus className="size-4 text-emerald-500" />,
  reply: <Reply className="size-4 text-amber-500" />,
}

export const TYPE_LABEL: Record<Notification['type'], string> = {
  comment: '评论了你的帖子',
  like: '点赞了你的帖子',
  follow: '关注了你',
  reply: '回复了你的评论',
}
