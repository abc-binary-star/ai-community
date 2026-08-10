import {
  BLOCK_ID_PREFIX,
  generateBlockId,
  isValidBlockId,
  type BlockInfo,
  type OutlineHeading,
} from './block-id'

export interface AnchorProjectionInput {
  sourceOutline: OutlineHeading[]
  targetOutline: OutlineHeading[]
  sourceAnchorId: string
}

export interface AnchorProjectionResult {
  targetBlockId: string | null
  matchType: 'exact' | 'text' | 'level' | 'order' | 'fallback'
  confidence: number
  debugInfo: {
    sourceText?: string
    targetText?: string
    sourceOrder?: number
    targetOrder?: number
  }
}

export function projectAnchorToOutline(input: AnchorProjectionInput): AnchorProjectionResult {
  const { sourceOutline, targetOutline, sourceAnchorId } = input
  const source = sourceOutline.find((o) => o.blockId === sourceAnchorId)

  if (!source) {
    return {
      targetBlockId: null,
      matchType: 'fallback',
      confidence: 0,
      debugInfo: {},
    }
  }

  const exact = targetOutline.find((t) => t.blockId === sourceAnchorId)
  if (exact) {
    return {
      targetBlockId: exact.blockId,
      matchType: 'exact',
      confidence: 1,
      debugInfo: { sourceText: source.text, targetText: exact.text, sourceOrder: source.order, targetOrder: exact.order },
    }
  }

  const sameText = targetOutline.filter((t) => t.text === source.text && t.level === source.level)
  if (sameText.length > 0) {
    const closest = sameText.reduce((prev, curr) =>
      Math.abs(curr.order - source.order) < Math.abs(prev.order - source.order) ? curr : prev,
    )
    return {
      targetBlockId: closest.blockId,
      matchType: 'text',
      confidence: 0.8,
      debugInfo: { sourceText: source.text, targetText: closest.text, sourceOrder: source.order, targetOrder: closest.order },
    }
  }

  const sameLevel = targetOutline.filter((t) => t.level === source.level)
  if (sameLevel.length > 0) {
    const closest = sameLevel.reduce((prev, curr) =>
      Math.abs(curr.order - source.order) < Math.abs(prev.order - source.order) ? curr : prev,
    )
    return {
      targetBlockId: closest.blockId,
      matchType: 'level',
      confidence: 0.5,
      debugInfo: { sourceText: source.text, targetText: closest.text, sourceOrder: source.order, targetOrder: closest.order },
    }
  }

  if (targetOutline.length > 0) {
    const orderIdx = Math.min(source.order, targetOutline.length - 1)
    const byOrder = targetOutline[orderIdx]
    return {
      targetBlockId: byOrder.blockId,
      matchType: 'order',
      confidence: 0.3,
      debugInfo: { sourceText: source.text, targetText: byOrder.text, sourceOrder: source.order, targetOrder: byOrder.order },
    }
  }

  return {
    targetBlockId: null,
    matchType: 'fallback',
    confidence: 0,
    debugInfo: { sourceText: source.text, sourceOrder: source.order },
  }
}

export interface BlockAnchorSyncInput {
  blocks: BlockInfo[]
  targetOutline: OutlineHeading[]
}

export function syncBlockAnchors(input: BlockAnchorSyncInput): Map<string, string> {
  const { blocks, targetOutline } = input
  const mapping = new Map<string, string>()
  const headingBlocks = blocks.filter((b) => b.type === 'heading' && typeof b.level === 'number')

  for (const block of headingBlocks) {
    const sourceHeading: OutlineHeading = {
      blockId: block.blockId,
      level: block.level!,
      text: block.text.trim(),
      order: block.order,
    }
    const existingMatches = targetOutline.filter(
      (t) => t.text === sourceHeading.text && t.level === sourceHeading.level,
    )
    const usedTargets = new Set(mapping.values())
    const available = existingMatches.filter((t) => !usedTargets.has(t.blockId))

    if (available.length > 0) {
      const closest = available.reduce((prev, curr) =>
        Math.abs(curr.order - sourceHeading.order) < Math.abs(prev.order - sourceHeading.order) ? curr : prev,
      )
      mapping.set(block.blockId, closest.blockId)
    }
  }
  return mapping
}

export interface ContentDeltaAnchorCtx {
  oldHeadings: OutlineHeading[]
  newHeadings: OutlineHeading[]
  deletedIds: Set<string>
}

export function computeAnchorPreservation(ctx: ContentDeltaAnchorCtx): {
  preserved: string[]
  remapped: Array<{ from: string; to: string; via: string }>
  lost: string[]
} {
  const { oldHeadings, newHeadings, deletedIds } = ctx
  const preserved: string[] = []
  const remapped: Array<{ from: string; to: string; via: string }> = []
  const lost: string[] = []

  for (const old of oldHeadings) {
    if (deletedIds.has(old.blockId)) continue
    const exact = newHeadings.find((n) => n.blockId === old.blockId)
    if (exact) {
      preserved.push(old.blockId)
      continue
    }
    const projection = projectAnchorToOutline({
      sourceOutline: oldHeadings,
      targetOutline: newHeadings,
      sourceAnchorId: old.blockId,
    })
    if (projection.targetBlockId && projection.matchType !== 'fallback') {
      remapped.push({ from: old.blockId, to: projection.targetBlockId, via: projection.matchType })
    } else {
      lost.push(old.blockId)
    }
  }
  return { preserved, remapped, lost }
}

export function ensureOutlineHeadingIds(outline: Omit<OutlineHeading, 'blockId'>[]): OutlineHeading[] {
  const seen = new Set<string>()
  return outline.map((o) => {
    let id = `${BLOCK_ID_PREFIX}h${o.order}_${(o.text || 'h').slice(0, 6)}`
    let counter = 0
    while (seen.has(id) || !isValidBlockId(id)) {
      if (counter > 100) {
        id = generateBlockId()
        break
      }
      id = `${BLOCK_ID_PREFIX}h${o.order}_${(o.text || 'h').slice(0, 6)}_${counter}`
      counter++
    }
    seen.add(id)
    return { ...o, blockId: id }
  })
}
