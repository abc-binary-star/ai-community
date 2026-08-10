export const BLOCK_ID_ATTR = 'data-block-id'
export const BLOCK_ID_PREFIX = 'blk_'

export function generateBlockId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = BLOCK_ID_PREFIX
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function isValidBlockId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(BLOCK_ID_PREFIX) && id.length >= BLOCK_ID_PREFIX.length + 6
}

export function blockIdFromNode(node: { attrs?: Record<string, unknown> }): string | null {
  const id = node.attrs?.blockId
  return isValidBlockId(id) ? id : null
}

export function setBlockIdAttrs<T extends Record<string, unknown>>(attrs: T, blockId: string): T & { blockId: string } {
  return { ...attrs, blockId }
}

export function ensureBlockIdAttrs<T extends Record<string, unknown>>(attrs: T): T & { blockId: string } {
  const existing = (attrs as { blockId?: unknown }).blockId
  if (isValidBlockId(existing)) return { ...attrs, blockId: existing }
  return { ...attrs, blockId: generateBlockId() }
}

export interface BlockInfo {
  blockId: string
  type: string
  level?: number
  text: string
  order: number
}

export interface OutlineHeading {
  blockId: string
  level: number
  text: string
  order: number
}

export function extractBlocksFromDoc(doc: {
  type?: string
  content?: Array<{
    type?: string
    attrs?: Record<string, unknown>
    content?: unknown
  }>
}): BlockInfo[] {
  const blocks: BlockInfo[] = []
  let order = 0
  const visit = (node: unknown, parentType?: string) => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
    const blockId = blockIdFromNode(n)
    if (!blockId) {
      if (n.content) for (const c of n.content) visit(c, n.type)
      return
    }
    const isContainer =
      n.type === 'bulletList' ||
      n.type === 'orderedList' ||
      n.type === 'taskList' ||
      n.type === 'listItem' ||
      n.type === 'taskItem' ||
      n.type === 'blockquote'
    if (isContainer) {
      if (n.content) for (const c of n.content) visit(c, n.type)
      return
    }
    let text = ''
    const collectText = (x: unknown) => {
      if (!x || typeof x !== 'object') return
      const obj = x as { type?: string; text?: string; content?: unknown[] }
      if (obj.type === 'text' && typeof obj.text === 'string') text += obj.text
      if (obj.content) for (const c of obj.content) collectText(c)
    }
    if (n.content) for (const c of n.content) collectText(c)
    blocks.push({
      blockId,
      type: n.type ?? 'paragraph',
      level: typeof n.attrs?.level === 'number' ? (n.attrs.level as number) : undefined,
      text,
      order: order++,
    })
    if (n.content) for (const c of n.content) visit(c, n.type)
  }
  if (doc.content) for (const c of doc.content) visit(c, doc.type)
  return blocks
}

export function blocksToOutline(blocks: BlockInfo[]): OutlineHeading[] {
  return blocks
    .filter((b) => b.type === 'heading' && typeof b.level === 'number' && b.text.trim().length > 0)
    .map((b) => ({ blockId: b.blockId, level: b.level!, text: b.text.trim(), order: b.order }))
    .sort((a, b) => a.order - b.order)
}

export function markdownHeadingsToOutline(markdown: string): OutlineHeading[] {
  const lines = markdown.split('\n')
  const outline: OutlineHeading[] = []
  let order = 0
  let inCodeBlock = false
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const m = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!m) continue
    const level = m[1].length
    let text = m[2].trim()
    text = text.replace(/^#{1,6}\s*/, '').replace(/\s*#{1,6}$/, '').trim()
    if (!text) continue
    outline.push({
      blockId: `${BLOCK_ID_PREFIX}h${order}_${hashStr(text).slice(0, 6)}`,
      level,
      text,
      order: order++,
    })
  }
  return outline
}

function hashStr(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

