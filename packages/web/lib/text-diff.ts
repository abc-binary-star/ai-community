export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffSegment {
  op: DiffOp
  text: string
}

const enum TokenType {
  Word = 0,
  Punct = 1,
  Space = 2,
  Newline = 3,
}

function tokenType(ch: string): TokenType {
  if (ch === '\n') return TokenType.Newline
  if (/\s/.test(ch)) return TokenType.Space
  if (/[\u4e00-\u9fa5]/.test(ch)) return TokenType.Word
  if (/[A-Za-z0-9_]/.test(ch)) return TokenType.Word
  return TokenType.Punct
}

function tokenize(text: string): string[] {
  if (text.length === 0) return []
  const tokens: string[] = []
  let buffer = ''
  let currentType: TokenType = tokenType(text[0])
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const t = tokenType(ch)
    if (t === currentType && t !== TokenType.Newline && t !== TokenType.Punct) {
      buffer += ch
    } else {
      if (buffer) tokens.push(buffer)
      buffer = ch
      currentType = t
    }
  }
  if (buffer) tokens.push(buffer)
  return tokens
}

export function computeDiff(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) {
    return oldText.length ? [{ op: 'equal', text: oldText }] : []
  }
  const a = tokenize(oldText)
  const b = tokenize(newText)
  const n = a.length
  const m = b.length
  if (n === 0) return b.length ? [{ op: 'insert', text: b.join('') }] : []
  if (m === 0) return a.length ? [{ op: 'delete', text: a.join('') }] : []

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const segments: DiffSegment[] = []
  let i = 0
  let j = 0
  let currentOp: DiffOp | null = null
  let buffer = ''
  const flush = () => {
    if (buffer && currentOp) {
      segments.push({ op: currentOp, text: buffer })
      buffer = ''
      currentOp = null
    }
  }
  const push = (op: DiffOp, text: string) => {
    if (op === currentOp) {
      buffer += text
    } else {
      flush()
      currentOp = op
      buffer = text
    }
  }
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('delete', a[i])
      i++
    } else {
      push('insert', b[j])
      j++
    }
  }
  while (i < n) {
    push('delete', a[i])
    i++
  }
  while (j < m) {
    push('insert', b[j])
    j++
  }
  flush()
  return segments
}

export interface SelectionRange {
  start: number
  end: number
}

export function applySelectionToValue(
  value: string,
  selection: SelectionRange,
  replacement: string,
): string {
  return value.slice(0, selection.start) + replacement + value.slice(selection.end)
}

export function extractSelection(
  value: string,
  selection: SelectionRange,
): string {
  return value.slice(selection.start, selection.end)
}

export interface PolishCandidate {
  id: string
  style: string
  original: string
  polished: string
  selection?: SelectionRange
  createdAt: number
}

export function createPolishCandidate(
  original: string,
  polished: string,
  style: string,
  selection?: SelectionRange,
): PolishCandidate {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    style,
    original,
    polished,
    selection,
    createdAt: Date.now(),
  }
}

export function applyCandidateToValue(value: string, candidate: PolishCandidate): string {
  if (candidate.selection) {
    return applySelectionToValue(value, candidate.selection, candidate.polished)
  }
  return candidate.polished
}

export function candidateDiffSegments(candidate: PolishCandidate): DiffSegment[] {
  if (candidate.selection) {
    return computeDiff(candidate.original.slice(candidate.selection.start, candidate.selection.end), candidate.polished)
  }
  return computeDiff(candidate.original, candidate.polished)
}
