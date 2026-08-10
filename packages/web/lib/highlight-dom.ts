// 划线高亮的 DOM 操作工具：选区定位、高亮渲染与清除
//
// 定位策略（解决帖子编辑后错位）：
//   以 selectedText 为定位主键——句子未改则能在内容中找到、位置正确；
//   句子被改/删则找不到、高亮自然消失。anchor（段落首部文本指纹）
//   仅用于重复文本时消歧，优先匹配划线所在的原段落，不依赖块索引。

export interface HighlightRange {
  id: string
  anchor: string
  startOffset: number
  endOffset: number
  selectedText: string
  color: string
}

export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(250, 204, 21, 0.45)',
  green: 'rgba(134, 239, 172, 0.55)',
  blue: 'rgba(147, 197, 253, 0.55)',
}

const ANCHOR_LEN = 40

// 收集块内的文本节点（跳过代码块，代码不参与划线）
function getTextNodes(root: Node): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement
      if (!p) return NodeFilter.FILTER_REJECT
      if (p.closest('pre,code')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n: Node | null
  while ((n = walker.nextNode())) nodes.push(n as Text)
  return nodes
}

function blockText(block: HTMLElement): string {
  return getTextNodes(block).map((t) => t.data).join('')
}

// 清除容器内所有划线 mark，还原纯文本
export function clearHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll('mark[data-highlight-id]')
  marks.forEach((m) => {
    const parent = m.parentNode
    if (!parent) return
    while (m.firstChild) parent.insertBefore(m.firstChild, m)
    parent.removeChild(m)
    parent.normalize()
  })
}

// 为所有可批注块填充 data-block-anchor。富文本优先使用稳定 blockId，旧 Markdown 回退文本指纹。
export function refreshAnchors(container: HTMLElement) {
  container.querySelectorAll('[data-block]').forEach((el) => {
    const e = el as HTMLElement
    const blockId = e.getAttribute('data-block-id')
    const anchor = blockId ? `blk:block:${blockId}` : blockText(e).trim().slice(0, ANCHOR_LEN)
    e.setAttribute('data-block-anchor', anchor)
  })
}

interface BlockInfo {
  el: HTMLElement
  text: string
  anchor: string
}

function collectBlocks(container: HTMLElement): BlockInfo[] {
  const blocks: BlockInfo[] = []
  container.querySelectorAll('[data-block-anchor]').forEach((el) => {
    const e = el as HTMLElement
    blocks.push({ el: e, text: blockText(e), anchor: e.getAttribute('data-block-anchor') || '' })
  })
  return blocks
}

export function applyHighlights(container: HTMLElement, highlights: HighlightRange[]) {
  clearHighlights(container)
  refreshAnchors(container)
  const blocks = collectBlocks(container)
  for (const h of highlights) {
    const loc = locate(blocks, h)
    if (loc) applyRange(loc.block, loc.start, loc.end, h)
  }
}

// 定位：优先 anchor 块内找 selectedText；否则全文找 selectedText，仅唯一匹配时采用
function locate(
  blocks: BlockInfo[],
  h: HighlightRange,
): { block: HTMLElement; start: number; end: number } | null {
  if (!h.selectedText) return null
  // 1. 优先在原段落（anchor 匹配）内查找
  for (const b of blocks) {
    if (b.anchor && b.anchor === h.anchor) {
      const idx = b.text.indexOf(h.selectedText)
      if (idx !== -1) return { block: b.el, start: idx, end: idx + h.selectedText.length }
    }
  }
  // 2. 全文查找 selectedText，仅当唯一匹配时采用（重复文本无法消歧则放弃）
  let found: { block: HTMLElement; start: number; end: number } | null = null
  let count = 0
  for (const b of blocks) {
    const idx = b.text.indexOf(h.selectedText)
    if (idx !== -1) {
      found = { block: b.el, start: idx, end: idx + h.selectedText.length }
      count++
      if (count > 1) return null
    }
  }
  return found
}

// 按块内偏移 [start,end] 拆分文本节点包裹 <mark>
function applyRange(block: HTMLElement, start: number, end: number, h: HighlightRange) {
  const textNodes = getTextNodes(block)
  const segs: { node: Text; localStart: number; localEnd: number }[] = []
  let pos = 0
  for (const tn of textNodes) {
    const len = tn.data.length
    const ns = pos
    const ne = pos + len
    if (ne > start && ns < end) {
      segs.push({
        node: tn,
        localStart: Math.max(0, start - ns),
        localEnd: Math.min(len, end - ns),
      })
    }
    pos = ne
  }
  // 从后往前处理，避免拆分文本节点影响前面节点的引用
  for (let i = segs.length - 1; i >= 0; i--) {
    const { node, localStart, localEnd } = segs[i]
    if (localStart >= localEnd) continue
    try {
      const range = document.createRange()
      range.setStart(node, localStart)
      range.setEnd(node, localEnd)
      const mark = document.createElement('mark')
      mark.setAttribute('data-highlight-id', h.id)
      mark.style.backgroundColor = HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.yellow
      mark.style.borderRadius = '2px'
      mark.style.padding = '0 1px'
      mark.style.cursor = 'pointer'
      range.surroundContents(mark)
    } catch {
      // 跨元素边界无法包裹时跳过该段
    }
  }
}

export interface SelectionInfo {
  anchor: string
  startOffset: number
  endOffset: number
  text: string
}

// 计算当前选区信息；仅当选区落在单个可划线块内时返回
export function getSelectionInBlock(container: HTMLElement): SelectionInfo | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const startEl = nodeToElement(range.startContainer)
  const endEl = nodeToElement(range.endContainer)
  if (!startEl || !endEl) return null
  const startBlock = startEl.closest('[data-block-anchor]')
  const endBlock = endEl.closest('[data-block-anchor]')
  if (!startBlock || !endBlock || startBlock !== endBlock) return null
  const anchor = startBlock.getAttribute('data-block-anchor')
  if (!anchor) return null
  const startOffset = offsetInBlock(startBlock as HTMLElement, range.startContainer, range.startOffset)
  const endOffset = offsetInBlock(startBlock as HTMLElement, range.endContainer, range.endOffset)
  if (startOffset >= endOffset) return null
  const text = sel.toString().trim()
  if (!text) return null
  return { anchor, startOffset, endOffset, text }
}

function nodeToElement(node: Node): HTMLElement | null {
  if (node.nodeType === Node.ELEMENT_NODE) return node as HTMLElement
  return node.parentElement
}

function offsetInBlock(block: HTMLElement, node: Node, offset: number): number {
  const textNodes = getTextNodes(block)
  let pos = 0
  for (const tn of textNodes) {
    if (tn === node) return pos + offset
    pos += tn.data.length
  }
  return pos
}

// 批注（段落想法）用的选区上下文：在划线选区基础上补充 TextQuoteSelector 的
// prefix/suffix 与段落快照，供作者编辑后服务端重定位（对齐锚点失效分析 L1-L4）。
const ANNOTATION_CONTEXT_LEN = 40

export interface SelectionContext extends SelectionInfo {
  prefix: string
  suffix: string
  paragraphSnapshot: string
}

// getBlockText 暴露块内可见纯文本（跳过 code/pre），供整段批注取段落快照。
export function getBlockText(block: HTMLElement): string {
  return blockText(block)
}

// getSelectionContext 返回当前选区的完整批注上下文；仅当选区落在单个可批注块内时返回。
export function getSelectionContext(container: HTMLElement): SelectionContext | null {
  const info = getSelectionInBlock(container)
  if (!info) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const startEl = nodeToElement(range.startContainer)
  const block = startEl?.closest('[data-block-anchor]') as HTMLElement | null
  if (!block) return null
  const full = blockText(block)
  const start = Math.max(0, Math.min(info.startOffset, full.length))
  const end = Math.max(start, Math.min(info.endOffset, full.length))
  const prefix = full.substring(Math.max(0, start - ANNOTATION_CONTEXT_LEN), start).trim()
  const suffix = full.substring(end, Math.min(full.length, end + ANNOTATION_CONTEXT_LEN)).trim()
  return { ...info, prefix, suffix, paragraphSnapshot: full.trim() }
}
