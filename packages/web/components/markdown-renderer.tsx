'use client'

import React, { forwardRef, memo } from 'react'
import type { JSONContent } from '@tiptap/core'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import rehypePrism from 'rehype-prism-plus'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn } from '@/lib/utils'
import { BLOCK_ID_ATTR, BLOCK_ID_PREFIX, markdownHeadingsToOutline } from '@/lib/block-id'

const MENTION_REGEX = /@([a-zA-Z0-9_\u4e00-\u9fff]{2,20})/g

const safeStyleValue = (_node: unknown, key: string, value: unknown) =>
  key !== 'style' || (typeof value === 'string' && !/url\s*\(|expression|javascript:/i.test(value))

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src || []), 'blob', 'data'],
  },
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    span: [...(defaultSchema.attributes?.span || []), 'className', 'style', safeStyleValue],
    pre: [...(defaultSchema.attributes?.pre || []), 'className'],
  },
}

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

const BLOCK_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'] as const
const ANCHORABLE_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'] as const

function hashText(s: string, seed = 0): string {
  let h = 2166136261 ^ seed
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export interface MarkdownRendererProps {
  content: string
  contentDoc?: JSONContent | null
  className?: string
  fontFamily?: string
  enableBlocks?: boolean
  enableBlockIds?: boolean
}

export const MarkdownRenderer = memo(
  forwardRef<HTMLDivElement, MarkdownRendererProps>(
  function MarkdownRenderer({ content, contentDoc, className, fontFamily, enableBlocks, enableBlockIds }, ref) {
    const outlineHeadings = React.useMemo(() => {
      if (!enableBlockIds) return new Map<number, string>()
      const items = markdownHeadingsToOutline(content)
      const map = new Map<number, string>()
      items.forEach((item) => map.set(item.order, item.blockId))
      return map
    }, [content, enableBlockIds])

    const contentBlockIds = React.useMemo(() => {
      const ids: string[] = []
      const walk = (node: JSONContent) => {
        if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote' || node.type === 'listItem' || node.type === 'taskItem') {
          if (typeof node.attrs?.blockId === 'string') ids.push(node.attrs.blockId)
        }
        for (const child of node.content ?? []) walk(child)
      }
      if (contentDoc?.type === 'doc') walk(contentDoc)
      return ids
    }, [contentDoc])
    let contentBlockCursor = 0
    const nextContentBlockId = () => {
      const id = contentBlockIds[contentBlockCursor]
      contentBlockCursor += 1
      return id
    }

    const blockIdGenerator = React.useMemo(() => {
      const counters: Record<string, number> = {}
      const used = new Set<string>()
      return (tag: string, textFragment: string) => {
        const idx = (counters[tag] ?? 0)
        counters[tag] = idx + 1
        if (tag.startsWith('h') && /^h[1-6]$/.test(tag)) {
          const levelOrder = parseInt(tag.slice(1), 10) + idx
          const fromMap = outlineHeadings.get(levelOrder - 1) ?? outlineHeadings.get(idx)
          if (fromMap) return fromMap
        }
        const base = `${BLOCK_ID_PREFIX}${tag}_${idx}_${hashText(textFragment, idx).slice(0, 5)}`
        let id = base
        let n = 0
        while (used.has(id)) {
          n += 1
          id = `${base}_${n}`
        }
        used.add(id)
        return id
      }
    }, [outlineHeadings])

    const components: React.ComponentProps<typeof ReactMarkdown>['components'] = {
      p: ({ children, node, ...props }) => {
        const hasImg = React.Children.toArray(children).some(
          (child) => React.isValidElement(child) && child.type === 'img',
        )
        const text = extractPlainText(node)
        const blockAttrs = buildBlockAttrs('p', text, enableBlocks, enableBlockIds, blockIdGenerator, nextContentBlockId())
        return (
          <p
            {...props}
            {...blockAttrs}
            className={hasImg ? 'text-center' : undefined}
          >
            {React.Children.map(children, (child) =>
              typeof child === 'string' ? renderTextWithMentions(child) : child,
            )}
          </p>
        )
      },
      pre: ({ children, node, ...props }) => (
        <pre {...props} className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
          {children}
        </pre>
      ),
      code: ({ className, children, ...props }) => (
        <code className={cn('rounded', !className && 'bg-muted px-1.5 py-0.5 text-sm', className)} {...props}>
          {children}
        </code>
      ),
      img: ({ src, alt, ...props }) => (
        <span className="block text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={typeof src === 'string' ? src : undefined}
            alt={alt || ''}
            className="inline-block max-w-full rounded-lg"
            loading="lazy"
            {...props}
          />
        </span>
      ),
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
      blockquote: ({ children, node, ...props }) => {
        const text = extractPlainText(node)
        const blockAttrs = buildBlockAttrs('blockquote', text, enableBlocks, enableBlockIds, blockIdGenerator, nextContentBlockId())
        return <blockquote {...props} {...blockAttrs}>{children}</blockquote>
      },
      li: ({ children, node, ...props }) => {
        const text = extractPlainText(node)
        const blockAttrs = buildBlockAttrs('li', text, enableBlocks, enableBlockIds, blockIdGenerator, nextContentBlockId())
        return <li {...props} {...blockAttrs}>{children}</li>
      },
    }

    for (const tag of BLOCK_TAGS) {
      const dyn = components as unknown as Record<string, (p: any) => React.ReactElement>
      if (!dyn[tag]) {
        dyn[tag] = ({ children, node, ...props }: React.ComponentProps<'h1'> & { node?: unknown }) => {
          const text = extractPlainText(node)
          const blockAttrs = buildBlockAttrs(tag, text, enableBlocks, enableBlockIds, blockIdGenerator, nextContentBlockId())
          return React.createElement(tag, { ...props, ...blockAttrs }, children)
        }
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none break-words',
          'prose-headings:scroll-mt-20',
          'prose-pre:bg-muted prose-pre:p-4',
          'prose-code:before:content-none prose-code:after:content-none',
          className,
        )}
        style={fontFamily ? { fontFamily } : undefined}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[[rehypeRaw], [rehypePrism, { ignoreMissing: true }], [rehypeSanitize, sanitizeSchema]]}
          components={components}
          urlTransform={(url) =>
            /^(blob|data|https?|mailto|tel):/i.test(url) ? url : ''
          }
        >
          {content}
        </ReactMarkdown>
      </div>
    )
  },
  ),
)

function extractPlainText(node: unknown): string {
  if (!node) return ''
  let out = ''
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const obj = n as { type?: string; value?: string; children?: unknown[] }
    if (obj.type === 'text' && typeof obj.value === 'string') out += obj.value
    if (Array.isArray(obj.children)) for (const c of obj.children) walk(c)
  }
  walk((node as { children?: unknown[] })?.children ?? node)
  return out.trim()
}

function buildBlockAttrs(
  tag: string,
  textFragment: string,
  enableBlocks: boolean | undefined,
  enableBlockIds: boolean | undefined,
  idGen: (tag: string, text: string) => string,
  stableBlockId?: string,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  const isAnchorable = ANCHORABLE_TAGS.includes(tag as typeof ANCHORABLE_TAGS[number])
  if (isAnchorable && enableBlocks) {
    attrs['data-block'] = ''
  }
  if (isAnchorable && stableBlockId) {
    attrs[BLOCK_ID_ATTR] = stableBlockId
    attrs['id'] = stableBlockId
  } else if (isAnchorable && enableBlockIds) {
    const id = idGen(tag, textFragment)
    attrs[BLOCK_ID_ATTR] = id
    attrs['id'] = id
  }
  return attrs
}
