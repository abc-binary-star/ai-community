// 批注锚点：统一富文本 blockId 锚点 + 兼容旧 Markdown offset 锚点
// 格式：
//   新版（富文本/稳定 ID）：
//     `blk:block:<blockId>:<charOffsetWithinBlock>:<length>`  —— 块内选区
//     `blk:block:<blockId>`                                     —— 整段锚点
//   旧版（markdown offset，存量帖子兜底兼容）：
//     `md:range:<startOffset>:<endOffset>`
//   整帖锚点：shared.WHOLE_ANNOTATION_ANCHOR（不变）
// 此工具库保证：客户端只传一种统一的 anchor 字符串；服务端可读任意一种；
// 读回时统一做 resolve（必要时投影到新 blockId），避免 UI 找不到对应段。

import { BLOCK_ID_ATTR, BLOCK_ID_PREFIX, blockIdFromNode, extractBlocksFromDoc, isValidBlockId, type BlockInfo } from './block-id'
import { blocksToOutline, type OutlineHeading } from './block-id'
import { projectAnchorToOutline } from './block-anchor-projection'
import type { JSONContent } from '@tiptap/core'
import { tiptapDocToMarkdown } from './content-projection'

export const WHOLE_ANCHOR = '__whole__'
const BLOCK_ANCHOR_PREFIX_v2 = 'blk:block:'
const MD_ANCHOR_PREFIX_v1 = 'md:range:'

export interface BlockAnchorRange {
  kind: 'block'
  blockId: string
  /** 该 block 纯文本内的字符偏移（UTF-16 code unit，兼容 String.slice） */
  startOffset: number
  /** 从 startOffset 开始的字符长度；0 表示整段锚点 */
  length: number
}

export interface MarkdownAnchorRange {
  kind: 'markdown'
  start: number
  end: number
}

export interface WholeAnchor {
  kind: 'whole'
}

export type ResolvedAnchor = BlockAnchorRange | MarkdownAnchorRange | WholeAnchor

export interface SelectionToAnchorOptions {
  selectedText?: string | null
  /** 默认对 selection 模式也允许回退到整段（当偏移算不准时） */
  allowFallbackToParagraph?: boolean
}

/**
 * 把编辑器当前选区（from/to pos）转换成可持久化的 anchor 字符串（优先 blockId 版本）。
 * 当上下文 doc 无法提取 block（纯 markdown 场景等）时，回退成 md range。
 */
export function selectionToAnchor(
  editorLike: { state?: { doc: unknown } } | null,
  from: number,
  to: number,
  currentDoc: JSONContent | string,
  opts: SelectionToAnchorOptions = {},
): {
  anchor: string
  startOffset: number
  endOffset: number
  selectedText: string
  paragraphSnapshot?: string
  blockId?: string
} {
  const selectedText = opts.selectedText ?? ''
  const allowFallback = opts.allowFallbackToParagraph ?? true

  // 优先：富文本 blockId 锚点
  const blk = extractBlockFromSelection(editorLike, from, to)
  if (blk) {
    const { blockId, text, startInBlock, length } = blk
    if (length === 0 && allowFallback) {
      return {
        anchor: `${BLOCK_ANCHOR_PREFIX_v2}${blockId}`,
        startOffset: 0,
        endOffset: 0,
        selectedText: text,
        paragraphSnapshot: text,
        blockId,
      }
    }
    return {
      anchor: `${BLOCK_ANCHOR_PREFIX_v2}${blockId}:${startInBlock}:${length}`,
      startOffset: startInBlock,
      endOffset: startInBlock + length,
      selectedText: selectedText || text.slice(startInBlock, startInBlock + length),
      paragraphSnapshot: text,
      blockId,
    }
  }

  // 兜底：markdown offset 锚点（兼容旧格式）
  const markdown = typeof currentDoc === 'string' ? currentDoc : tiptapDocToMarkdown(currentDoc)
  const safeStart = Math.max(0, Math.min(from, markdown.length))
  const safeEnd = Math.max(safeStart, Math.min(to, markdown.length))
  return {
    anchor: `${MD_ANCHOR_PREFIX_v1}${safeStart}:${safeEnd}`,
    startOffset: safeStart,
    endOffset: safeEnd,
    selectedText: selectedText || markdown.slice(safeStart, safeEnd),
    paragraphSnapshot: undefined,
    blockId: undefined,
  }
}

function extractBlockFromSelection(
  editorLike: { state?: { doc: unknown } } | null,
  from: number,
  to: number,
): { blockId: string; text: string; startInBlock: number; length: number } | null {
  try {
    const state = (editorLike as { state?: { doc: { textBetween: (a: number, b: number, sep?: string) => string; nodesBetween: (a: number, b: number, fn: (node: any, pos: number) => boolean | void) => void } } } | undefined)?.state
    if (!state?.doc) return null
    const doc = state.doc
    let startBlockId: string | null = null
    let startBlockStart = -1
    let startBlockText = ''
    doc.nodesBetween(from, from, (node, pos) => {
      if (node.isBlock) {
        const id = blockIdFromNode(node) || (node.attrs as Record<string, unknown> | undefined)?.blockId as unknown
        if (typeof id === 'string' && isValidBlockId(id)) {
          startBlockId = id
          startBlockStart = pos
          startBlockText = node.textContent ?? ''
          return false
        }
      }
      return undefined
    })
    if (!startBlockId || startBlockStart < 0) return null
    const startInBlock = Math.max(0, from - (startBlockStart + 1)) // +1：ProseMirror 节点开始 pos
    let endBlockId: string | null = null
    let endBlockEnd = -1
    doc.nodesBetween(to, to, (node, pos) => {
      if (node.isBlock) {
        const id = blockIdFromNode(node) || (node.attrs as Record<string, unknown> | undefined)?.blockId as unknown
        if (typeof id === 'string' && isValidBlockId(id)) {
          endBlockId = id
          endBlockEnd = pos
          return false
        }
      }
      return undefined
    })
    if (endBlockId && endBlockId !== startBlockId) {
      // 跨段：整段兜底
      return {
        blockId: startBlockId,
        text: startBlockText,
        startInBlock: 0,
        length: 0,
      }
    }
    const endInBlock = endBlockEnd >= 0
      ? Math.max(startInBlock, to - (endBlockEnd + 1))
      : Math.max(startInBlock, from - (startBlockStart + 1) + (to - from))
    const length = Math.max(0, endInBlock - startInBlock)
    return {
      blockId: startBlockId,
      text: startBlockText,
      startInBlock,
      length,
    }
  } catch {
    return null
  }
}

/**
 * 解析存储的 anchor 字符串为统一结构；无法识别时抛错（由调用方降级为 orphaned）。
 */
export function parseAnchor(raw: string): ResolvedAnchor {
  if (!raw) return { kind: 'whole' }
  if (raw === WHOLE_ANCHOR) return { kind: 'whole' }

  if (raw.startsWith(BLOCK_ANCHOR_PREFIX_v2)) {
    const tail = raw.slice(BLOCK_ANCHOR_PREFIX_v2.length)
    const parts = tail.split(':')
    const blockId = parts[0]
    if (!isValidBlockId(blockId)) {
      throw new Error(`invalid block anchor: ${raw}`)
    }
    if (parts.length === 1) {
      return { kind: 'block', blockId, startOffset: 0, length: 0 }
    }
    if (parts.length === 3) {
      const startOffset = Number(parts[1])
      const length = Number(parts[2])
      if (!Number.isFinite(startOffset) || !Number.isFinite(length)) {
        throw new Error(`invalid block anchor range: ${raw}`)
      }
      return { kind: 'block', blockId, startOffset: Math.max(0, startOffset), length: Math.max(0, length) }
    }
    throw new Error(`unsupported block anchor format: ${raw}`)
  }

  if (raw.startsWith(MD_ANCHOR_PREFIX_v1)) {
    const tail = raw.slice(MD_ANCHOR_PREFIX_v1.length)
    const [startStr, endStr] = tail.split(':')
    const start = Number(startStr)
    const end = Number(endStr)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new Error(`invalid md range anchor: ${raw}`)
    }
    return { kind: 'markdown', start, end }
  }

  // 兼容：直接传入 blk_xxx（旧 outline anchor 样式）
  if (raw.startsWith(BLOCK_ID_PREFIX) && isValidBlockId(raw)) {
    return { kind: 'block', blockId: raw, startOffset: 0, length: 0 }
  }

  throw new Error(`unknown anchor format: ${raw}`)
}

export interface AnchorResolveOptions {
  /** 当前帖子内容——富文本 doc 或 markdown 字符串 */
  doc: JSONContent | string
  /** 仅 markdown 场景：传入 markdown 文本即可（没有 blockId 时仍能解析） */
  currentMarkdown?: string
  /** 当旧 anchor 定位失败时，用于投影的历史大纲（可选） */
  historyOutline?: OutlineHeading[]
}

/**
 * 在当前文档里解析一个持久化的 anchor，尽量定位到块级位置（或 markdown 范围），
 * 同时判断锚点是否失效（orphaned）。富文本场景优先投影到 blockId。
 */
export function resolveAnchor(
  rawAnchor: string,
  opts: AnchorResolveOptions,
): {
  resolved: ResolvedAnchor
  orphaned: boolean
  blockId?: string
  paragraphPreview?: string
} {
  const { doc } = opts
  let parsed: ResolvedAnchor
  try {
    parsed = parseAnchor(rawAnchor)
  } catch {
    return { resolved: { kind: 'whole' }, orphaned: true }
  }

  // 整帖：肯定不是 orphaned
  if (parsed.kind === 'whole') {
    return { resolved: parsed, orphaned: false }
  }

  // Markdown 锚点 + 有 markdown 文本：直接以字符偏移作为预览即可
  if (parsed.kind === 'markdown') {
    const md = typeof doc === 'string' ? doc : opts.currentMarkdown ?? tiptapDocToMarkdown(doc)
    const start = Math.max(0, Math.min(parsed.start, md.length))
    const end = Math.max(start, Math.min(parsed.end, md.length))
    return {
      resolved: { kind: 'markdown', start, end },
      orphaned: start === end && parsed.start !== parsed.end,
      paragraphPreview: md.slice(Math.max(0, start - 40), Math.min(md.length, end + 40)),
    }
  }

  // Block 锚点：必须在富文本 doc 里找
  const blocks = typeof doc === 'string' ? [] : extractBlocksFromDoc(doc)
  const target = blocks.find((b) => b.blockId === parsed.blockId)
  if (target) {
    const preview = target.text.length > 120 ? `${target.text.slice(0, 120)}…` : target.text
    return {
      resolved: {
        kind: 'block',
        blockId: target.blockId,
        startOffset: Math.min(parsed.startOffset, target.text.length),
        length: Math.max(0, Math.min(parsed.length, target.text.length - parsed.startOffset)),
      },
      orphaned: parsed.length > 0 && parsed.startOffset >= target.text.length,
      blockId: target.blockId,
      paragraphPreview: preview,
    }
  }

  // 找不到：通过 historyOutline + 当前 outline 做 remap（仅 heading blocks，保留了语义最强的锚点）
  if (typeof doc !== 'string' && opts.historyOutline?.length) {
    const currentOutline = blocksToOutline(blocks)
    const projected = projectAnchorToOutline({
      sourceOutline: opts.historyOutline,
      targetOutline: currentOutline,
      sourceAnchorId: parsed.blockId,
    })
    if (projected.targetBlockId) {
      const remapped = blocks.find((b) => b.blockId === projected.targetBlockId)
      return {
        resolved: { kind: 'block', blockId: projected.targetBlockId, startOffset: 0, length: 0 },
        orphaned: projected.matchType === 'fallback',
        blockId: projected.targetBlockId,
        paragraphPreview: remapped?.text,
      }
    }
  }

  // 完全找不到：orphaned
  return {
    resolved: parsed,
    orphaned: true,
    blockId: parsed.blockId,
  }
}

export function buildParagraphAnchor(blockId: string): string {
  if (!isValidBlockId(blockId)) throw new Error('invalid blockId')
  return `${BLOCK_ANCHOR_PREFIX_v2}${blockId}`
}

export function buildSelectionAnchor(blockId: string, startOffset: number, length: number): string {
  if (!isValidBlockId(blockId)) throw new Error('invalid blockId')
  return `${BLOCK_ANCHOR_PREFIX_v2}${blockId}:${Math.max(0, startOffset)}:${Math.max(0, length)}`
}

export function getDomElementForBlock(blockId: string, scope: ParentNode = document): HTMLElement | null {
  if (!isValidBlockId(blockId)) return null
  return scope.querySelector<HTMLElement>(`[${BLOCK_ID_ATTR}="${blockId}"]`)
}

export interface AnchorIndexEntry {
  anchor: string
  blockId?: string
  orphaned: boolean
}

/**
 * 给服务端返回的想法计数（各 anchor 的数量）批量解析，返回可在 UI 上定位的条目。
 * 对已失效的旧 markdown offset 或 deleted block，标记为 orphaned 并隐藏高亮。
 */
export function indexAnchors(
  anchors: Array<{ anchor: string; count?: number }>,
  opts: AnchorResolveOptions,
): Map<string, AnchorIndexEntry> {
  const out = new Map<string, AnchorIndexEntry>()
  for (const a of anchors) {
    const res = resolveAnchor(a.anchor, opts)
    out.set(a.anchor, {
      anchor: a.anchor,
      blockId: res.blockId,
      orphaned: res.orphaned,
    })
  }
  return out
}

// 给 content-projection 之类的外部使用：在 blocks 中按 blockId 找 BlockInfo（不存在返回 null）
export function findBlockById(blocks: BlockInfo[], blockId: string): BlockInfo | null {
  return blocks.find((b) => b.blockId === blockId) ?? null
}
