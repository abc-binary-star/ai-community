import React from 'react'
import Link from 'next/link'

// 与后端 parseMentions 保持一致的正则
const MENTION_REGEX = /@([a-zA-Z0-9_\u4e00-\u9fff]{2,20})/g

// 将文本中的 @username 渲染为可点击的链接
export function renderContentWithMentions(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = MENTION_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    parts.push(
      <Link
        key={`mention-${key++}`}
        href={`/u/${encodeURIComponent(match[1])}`}
        className="font-medium text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        @{match[1]}
      </Link>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  return parts
}
