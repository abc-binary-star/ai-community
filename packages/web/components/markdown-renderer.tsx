'use client'

import React from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypePrism from 'rehype-prism-plus'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn } from '@/lib/utils'

// 与后端 parseMentions 保持一致的正则
const MENTION_REGEX = /@([a-zA-Z0-9_\u4e00-\u9fff]{2,20})/g

// 允许 code 上添加 className（rehype-prism 的高亮需要）
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    span: [...(defaultSchema.attributes?.span || []), 'className'],
    pre: [...(defaultSchema.attributes?.pre || []), 'className'],
  },
}

// 将文本节点中的 @username 渲染为可点击链接
function renderTextWithMentions(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
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
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

const components: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // 在文本节点中解析 @提及
  p: ({ children, ...props }) => (
    <p {...props}>
      {React.Children.map(children, (child) =>
        typeof child === 'string' ? renderTextWithMentions(child) : child,
      )}
    </p>
  ),
  // 代码块：添加滚动条和复制友好样式
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className="overflow-x-auto rounded-lg bg-muted p-4 text-sm"
    >
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => (
    <code className={cn('rounded', !className && 'bg-muted px-1.5 py-0.5 text-sm', className)} {...props}>
      {children}
    </code>
  ),
  // 图片：响应式 + 圆角
  img: ({ src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === 'string' ? src : undefined}
      alt={alt || ''}
      className="max-w-full rounded-lg"
      {...props}
    />
  ),
  // 链接：新标签打开
  a: ({ href, children, ...props }) => (
    <Link
      href={href || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </Link>
  ),
  // 表格：添加边框和滚动容器
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-medium" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-border px-3 py-2" {...props}>
      {children}
    </td>
  ),
}

export function MarkdownRenderer({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none break-words',
        'prose-headings:scroll-mt-20',
        'prose-pre:bg-muted prose-pre:p-4',
        'prose-code:before:content-none prose-code:after:content-none',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypePrism, { ignoreMissing: true }], [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
