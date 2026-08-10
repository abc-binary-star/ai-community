import { generateJSON, generateHTML } from '@tiptap/html'
import { Extension } from '@tiptap/core'
import type { Extensions, JSONContent } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { marked } from 'marked'
import { BLOCK_ID_ATTR, ensureBlockIdAttrs, generateBlockId, isValidBlockId } from './block-id'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ensureBlockIds: {
      ensureBlockIds: () => ReturnType
    }
  }
}

const BlockIdGlobalExtension = Extension.create({
  name: 'blockIdGlobal',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'blockquote',
          'codeBlock',
          'horizontalRule',
          'image',
          'bulletList',
          'orderedList',
          'listItem',
          'taskList',
          'taskItem',
        ],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute(BLOCK_ID_ATTR)
              return isValidBlockId(v) ? v : null
            },
            renderHTML: (attrs) => {
              const id = attrs.blockId
              if (!isValidBlockId(id)) return {}
              return { [BLOCK_ID_ATTR]: id as string, id: id as string }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      ensureBlockIds:
        () =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true
          const BLOCK_TYPES = new Set([
            'paragraph', 'heading', 'blockquote', 'codeBlock', 'horizontalRule', 'image',
          ])
          const nodesToUpdate: Array<{ pos: number; node: { type: { name: string }; attrs: Record<string, unknown> } }> = []
          state.doc.nodesBetween(0, state.doc.nodeSize, (node, pos) => {
            if (node.isBlock && BLOCK_TYPES.has(node.type.name)) {
              if (!isValidBlockId(node.attrs.blockId)) nodesToUpdate.push({ pos, node })
            }
          })
          if (nodesToUpdate.length === 0) return false
          for (const { pos, node } of nodesToUpdate) {
            tr.setNodeMarkup(pos, undefined, ensureBlockIdAttrs(node.attrs))
          }
          dispatch(tr)
          return true
        },
    }
  },
})

export function createBlockIdAwareExtensions(): Extensions {
  return [
    StarterKit.configure({ link: false }),
    BlockIdGlobalExtension,
    Link.configure({ openOnClick: false }),
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
  ]
}

export const contentExtensions: Extensions = createBlockIdAwareExtensions()

export function ensureDocBlockIds(doc: JSONContent): JSONContent {
  const BLOCK_TYPES = new Set([
    'paragraph', 'heading', 'blockquote', 'codeBlock', 'horizontalRule', 'image',
  ])
  const visit = (node: JSONContent): JSONContent => {
    const next: JSONContent = { ...node }
    if (BLOCK_TYPES.has(node.type ?? '')) {
      next.attrs = ensureBlockIdAttrs(node.attrs ?? {})
    }
    if (next.content) next.content = next.content.map(visit)
    return next
  }
  return visit(doc)
}

export const emptyContentDoc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: generateBlockId() } }] }

function escapeText(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, '\\$1')
}

function markedText(value: string, marks: JSONContent['marks'] = []): string {
  let output = escapeText(value)
  for (const mark of marks ?? []) {
    if (mark.type === 'code') output = `\`${value.replace(/`/g, '\\`')}\``
    if (mark.type === 'bold') output = `**${output}**`
    if (mark.type === 'italic') output = `*${output}*`
    if (mark.type === 'strike') output = `~~${output}~~`
    if (mark.type === 'link') output = `[${output}](${mark.attrs?.href ?? ''})`
  }
  return output
}

function inlineMarkdown(nodes: JSONContent[] = []): string {
  return nodes.map((node) => {
    if (node.type === 'text') return markedText(node.text ?? '', node.marks)
    if (node.type === 'hardBreak') return '  \n'
    if (node.type === 'image') return `![${node.attrs?.alt ?? '图片'}](${node.attrs?.src ?? ''})`
    return inlineMarkdown(node.content)
  }).join('')
}

function listItemMarkdown(node: JSONContent, ordered: boolean, index: number, depth: number): string {
  const marker = ordered ? `${index + 1}. ` : '- '
  const indent = '  '.repeat(depth)
  const blocks = node.content ?? []
  const first = blocks[0]
  const checked = node.attrs?.checked
  const taskPrefix = typeof checked === 'boolean' ? `[${checked ? 'x' : ' '}] ` : ''
  const head = `${indent}${marker}${taskPrefix}${first ? inlineMarkdown(first.content) : ''}`
  const rest = blocks.slice(1).map((child) => {
    if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
      return listMarkdown(child, depth + 1)
    }
    return `${indent}  ${blockMarkdown(child).replace(/\n/g, `\n${indent}  `)}`
  }).filter(Boolean)
  return [head, ...rest].join('\n')
}

function listMarkdown(node: JSONContent, depth = 0): string {
  const ordered = node.type === 'orderedList'
  return (node.content ?? []).map((item, index) => listItemMarkdown(item, ordered, index, depth)).join('\n')
}

function blockMarkdown(node: JSONContent): string {
  if (node.type === 'paragraph') return inlineMarkdown(node.content)
  if (node.type === 'heading') return `${'#'.repeat(node.attrs?.level ?? 2)} ${inlineMarkdown(node.content)}`
  if (node.type === 'blockquote') return (node.content ?? []).map(blockMarkdown).join('\n\n').split('\n').map((line) => `> ${line}`).join('\n')
  if (node.type === 'codeBlock') return `\`\`\`${node.attrs?.language ?? ''}\n${(node.content ?? []).map((item) => item.text ?? '').join('')}\n\`\`\``
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') return listMarkdown(node)
  if (node.type === 'image') return inlineMarkdown([node])
  if (node.type === 'horizontalRule') return '---'
  return inlineMarkdown(node.content)
}

export function tiptapBlockToMarkdown(node: JSONContent): string {
  return blockMarkdown(node)
}

export function tiptapDocToMarkdown(doc: JSONContent): string {
  return (doc.content ?? []).map(blockMarkdown).filter((block) => block !== '').join('\n\n').trim()
}

export function markdownToTiptapDoc(markdown: string): JSONContent {
  if (!markdown.trim()) return emptyContentDoc
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string
  const json = generateJSON(html, contentExtensions)
  return ensureDocBlockIds(json)
}

export function tiptapDocToHtml(doc: JSONContent): string {
  return generateHTML(ensureDocBlockIds(doc), contentExtensions)
}

export function normalizeContentDoc(contentDoc: unknown, markdown: string): JSONContent {
  if (contentDoc && typeof contentDoc === 'object' && (contentDoc as JSONContent).type === 'doc') {
    return contentDoc as JSONContent
  }
  return markdownToTiptapDoc(markdown)
}

export function contentDocText(doc: JSONContent): string {
  const chunks: string[] = []
  const visit = (node: JSONContent) => {
    if (node.type === 'text' && node.text) chunks.push(node.text)
    if (node.type === 'image') chunks.push(node.attrs?.alt ?? '图片')
    for (const child of node.content ?? []) visit(child)
    if (['paragraph', 'heading', 'blockquote', 'listItem', 'taskItem'].includes(node.type ?? '')) chunks.push('\n')
  }
  visit(doc)
  return chunks.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function countContentImages(doc: JSONContent): number {
  let count = 0
  const visit = (node: JSONContent) => {
    if (node.type === 'image') count += 1
    for (const child of node.content ?? []) visit(child)
  }
  visit(doc)
  return count
}

export interface ProtectedRewriteMarkdown {
  markdown: string
  restore: (candidate: string) => string
}

export function protectMarkdownForRewrite(markdown: string): ProtectedRewriteMarkdown {
  const protectedParts: string[] = []
  const protect = (value: string) => {
    const token = `AIPROTECTED${protectedParts.length}TOKEN`
    protectedParts.push(value)
    return token
  }
  const patterns = [
    /```[^\n]*\n[\s\S]*?```/g,
    /!\[[^\]]*\]\([^\n)]*\)/g,
    /\[[^\]]+\]\([^\n)]*\)/g,
    /`[^`\n]+`/g,
    /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm,
  ]
  let protectedMarkdown = markdown
  for (const pattern of patterns) protectedMarkdown = protectedMarkdown.replace(pattern, protect)
  return {
    markdown: protectedMarkdown,
    restore: (candidate) => {
      let restored = candidate
      protectedParts.forEach((part, index) => {
        const token = `AIPROTECTED${index}TOKEN`
        if (restored.split(token).length !== 2) throw new Error('AI 润色结果未完整保留图片、链接或代码等结构')
        restored = restored.replace(token, part)
      })
      return restored
    },
  }
}

export function replaceContentImageSources(doc: JSONContent, replacements: ReadonlyMap<string, string>): JSONContent {
  const visit = (node: JSONContent): JSONContent => {
    const next = { ...node }
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && replacements.has(node.attrs.src)) {
      next.attrs = { ...node.attrs, src: replacements.get(node.attrs.src) }
    }
    if (node.content) next.content = node.content.map(visit)
    return next
  }
  return visit(doc)
}
