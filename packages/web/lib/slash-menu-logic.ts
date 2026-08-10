export interface SlashItem {
  key: string
  label: string
  desc: string
  icon?: unknown
  keywords?: string[]
  run?: (...args: unknown[]) => unknown
}

export interface SlashFilterInput {
  query: string
  items: SlashItem[]
}

export function filterSlashItems(input: SlashFilterInput): SlashItem[] {
  const q = input.query.trim().toLowerCase()
  if (!q) return input.items
  return input.items.filter((item) => {
    if (item.key.toLowerCase().includes(q)) return true
    if (item.label.toLowerCase().includes(q)) return true
    if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return true
    return false
  })
}

export interface SlashTextContext {
  textBefore: string
  selectionFrom: number
}

export interface SlashDetectionResult {
  shouldOpen: boolean
  query: string
  rangeFrom: number
  rangeTo: number
}

export function detectSlashCommand(ctx: SlashTextContext): SlashDetectionResult {
  const { textBefore, selectionFrom } = ctx
  const slashIdx = textBefore.lastIndexOf('/')
  if (slashIdx < 0) {
    return { shouldOpen: false, query: '', rangeFrom: 0, rangeTo: 0 }
  }
  const between = textBefore.slice(slashIdx + 1)
  if (/\s/.test(between)) {
    return { shouldOpen: false, query: '', rangeFrom: 0, rangeTo: 0 }
  }
  const rangeFrom = selectionFrom - textBefore.length + slashIdx
  const rangeTo = selectionFrom
  return { shouldOpen: true, query: between, rangeFrom, rangeTo }
}

export function wrapActiveIndex(active: number, length: number, delta: number): number {
  const size = Math.max(1, length)
  return ((active + delta) % size + size) % size
}
