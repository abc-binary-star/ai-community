import {
  applyCandidateToValue,
  candidateDiffSegments,
  computeDiff,
  createPolishCandidate,
  extractSelection,
  type DiffSegment,
  type PolishCandidate,
  type SelectionRange,
} from './text-diff'

export type { DiffSegment }

export type BlockReviewStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'stale'

export interface AiDiffBlock {
  blockId: string
  blockType: string
  originalMarkdown: string
  polishedMarkdown: string
  sourceVersion: string
  requestId?: string
  style?: string
  status: BlockReviewStatus
  error?: string
}

export function hashAiDiffSource(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createAiDiffBlocks(
  blocks: Array<{ blockId: string; blockType?: string; originalMarkdown: string }>,
): AiDiffBlock[] {
  return blocks.map((block) => ({
    ...block,
    blockType: block.blockType ?? 'paragraph',
    polishedMarkdown: '',
    sourceVersion: hashAiDiffSource(block.originalMarkdown),
    status: 'pending',
  }))
}

export function updateAiDiffBlock(
  blocks: AiDiffBlock[],
  blockId: string,
  patch: Partial<Omit<AiDiffBlock, 'blockId' | 'originalMarkdown' | 'blockType'>>,
): AiDiffBlock[] {
  return blocks.map((block) => block.blockId === blockId ? { ...block, ...patch } : block)
}

export function decideAllAiDiffBlocks(
  blocks: AiDiffBlock[],
  status: Extract<BlockReviewStatus, 'accepted' | 'rejected'>,
): AiDiffBlock[] {
  return blocks.map((block) => {
    if (block.status !== 'ready' && status === 'accepted') return block
    if (block.status === 'generating') return block
    return { ...block, status, error: undefined }
  })
}

export function pendingAiDiffBlockCount(blocks: AiDiffBlock[]): number {
  return blocks.filter((block) => block.status === 'pending' || block.status === 'ready').length
}

export interface ApplyAllSummary {
  succeeded: number
  failed: number
  skipped: number
  blocks: AiDiffBlock[]
}

export function applyReadyAiDiffBlocks(
  blocks: AiDiffBlock[],
  apply: (block: AiDiffBlock) => 'accepted' | 'failed' | 'stale',
): ApplyAllSummary {
  let succeeded = 0
  let failed = 0
  let skipped = 0
  const next = blocks.map((block) => {
    if (block.status !== 'ready' || !block.polishedMarkdown) {
      skipped += 1
      return block
    }
    const result = apply(block)
    if (result === 'accepted') {
      succeeded += 1
      return { ...block, status: 'accepted' as const, error: undefined }
    }
    failed += 1
    return {
      ...block,
      status: result,
      error: result === 'stale' ? '原段落已变化，请重新生成' : '无法应用该段修改',
    }
  })
  return { succeeded, failed, skipped, blocks: next }
}

export interface DiffStats {
  inserted: number
  deleted: number
  equal: number
}

export function computeDiffStats(segments: DiffSegment[]): DiffStats {
  let inserted = 0
  let deleted = 0
  let equal = 0
  for (const s of segments) {
    const len = [...s.text].length
    if (s.op === 'insert') inserted += len
    else if (s.op === 'delete') deleted += len
    else equal += len
  }
  return { inserted, deleted, equal }
}

export type AiWorkflowStage =
  | 'idle'
  | 'requesting'
  | 'previewing'
  | 'applying'
  | 'accepted'
  | 'rejected'
  | 'error'

export interface PolishWorkflowState {
  stage: AiWorkflowStage
  originalValue: string
  currentValue: string
  candidate: PolishCandidate | null
  selection: SelectionRange | null
  lastError?: string
  history: Array<{ value: string; candidateId?: string }>
  blocks: AiDiffBlock[]
}

export function createInitialWorkflowState(initialValue: string = ''): PolishWorkflowState {
  return {
    stage: 'idle',
    originalValue: initialValue,
    currentValue: initialValue,
    candidate: null,
    selection: null,
    history: [],
    blocks: [],
  }
}

export function startPolishRequest(
  state: PolishWorkflowState,
  selection?: SelectionRange,
): PolishWorkflowState {
  const selectionToUse = selection ?? state.selection
  const original = selectionToUse
    ? extractSelection(state.currentValue, selectionToUse)
    : state.currentValue
  return {
    ...state,
    stage: 'requesting',
    selection: selectionToUse,
    originalValue: original,
    candidate: null,
    lastError: undefined,
  }
}

export function receivePolishCandidate(
  state: PolishWorkflowState,
  polishedText: string,
  style: string,
): PolishWorkflowState {
  if (state.stage !== 'requesting') return state
  const candidate = createPolishCandidate(
    state.originalValue,
    polishedText,
    style,
    state.selection ?? undefined,
  )
  return {
    ...state,
    stage: 'previewing',
    candidate,
  }
}

export function failPolishRequest(state: PolishWorkflowState, error: string): PolishWorkflowState {
  return {
    ...state,
    stage: 'error',
    lastError: error,
    candidate: null,
  }
}

export function acceptCandidate(state: PolishWorkflowState): PolishWorkflowState {
  if (state.stage !== 'previewing' || !state.candidate) return state
  const newValue = applyCandidateToValue(state.currentValue, state.candidate)
  return {
    ...state,
    stage: 'accepted',
    history: [...state.history, { value: state.currentValue, candidateId: state.candidate.id }],
    currentValue: newValue,
    candidate: null,
    selection: null,
  }
}

export function rejectCandidate(state: PolishWorkflowState): PolishWorkflowState {
  if (state.stage !== 'previewing') return state
  return {
    ...state,
    stage: 'rejected',
    candidate: null,
    selection: null,
  }
}

export function restoreLastAccepted(state: PolishWorkflowState): PolishWorkflowState {
  if (state.history.length === 0) return state
  const lastEntry = state.history[state.history.length - 1]
  return {
    ...state,
    stage: 'idle',
    currentValue: lastEntry.value,
    history: state.history.slice(0, -1),
    candidate: null,
  }
}

export function regenerateWithStyle(
  state: PolishWorkflowState,
  newStyle: string,
): PolishWorkflowState {
  if (!state.candidate) return state
  return {
    ...state,
    stage: 'requesting',
    originalValue: state.candidate.original,
    selection: state.candidate.selection ?? null,
    lastError: undefined,
  }
}

export interface AiEnrichInput {
  title: string
  content: string
  only?: 'title' | 'summary' | 'tags'
}

export function validateEnrichInput(input: AiEnrichInput): { valid: boolean; reason?: string } {
  if (!input.content || input.content.trim().length < 10) {
    return { valid: false, reason: '内容至少 10 个字才能使用 AI 补全' }
  }
  return { valid: true }
}

export function mergeEnrichResults<T extends { titles?: string[]; summary?: string; tags?: string[] }>(
  data: T,
): { titles: string[]; summary: string; tags: string[]; applied: number } {
  let applied = 0
  const titles: string[] = []
  let summary = ''
  const tags: string[] = []
  if (data.titles?.length) {
    titles.push(...data.titles)
    applied++
  }
  if (data.summary) {
    summary = data.summary
    applied++
  }
  if (data.tags?.length) {
    tags.push(...data.tags)
    applied++
  }
  return { titles, summary, tags, applied }
}
