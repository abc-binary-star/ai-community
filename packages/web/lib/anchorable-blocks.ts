import type { JSONContent } from '@tiptap/core'

/**
 * 统一定义：哪些 Tiptap 节点类型会被分配稳定 blockId。
 * 编辑器、内容投影、阅读页和批注锚点共用此定义。
 */
export const BLOCK_ID_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'listItem',
  'taskItem',
])

/**
 * 统一定义：哪些 Tiptap 节点类型是"可批注单元"。
 * 可批注单元 = 在阅读页会输出 data-block 属性、可以创建段落想法的块。
 *
 * 注意：
 * - blockquote 本身是批注单元，其内部 paragraph 不单独成为批注单元。
 * - listItem/taskItem 本身是批注单元，其内部 paragraph 不单独成为批注单元。
 * - codeBlock/horizontalRule/image 有 blockId 但不可批注（不输出 data-block）。
 */
export const ANCHORABLE_TIPTAP_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'taskItem',
])

/**
 * 统一定义：哪些 HTML 标签在阅读页 DOM 中是"可批注"的。
 * 与 ANCHORABLE_TIPTAP_TYPES 一一对应（Tiptap type → HTML tag）。
 */
export const ANCHORABLE_DOM_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
])

/**
 * Tiptap 节点类型到 HTML 标签的映射，用于阅读页类型匹配。
 */
export const TIPTAP_TYPE_TO_DOM_TAG: Record<string, string> = {
  paragraph: 'p',
  heading: 'h', // 特殊：heading 的具体标签由 level 决定
  blockquote: 'blockquote',
  listItem: 'li',
  taskItem: 'li',
}

/**
 * 判断 HTML 标签是否与 Tiptap 节点类型兼容。
 * heading 类型匹配 h1~h6；其他类型精确匹配。
 */
export function isDomTagCompatibleWithTiptapType(domTag: string, tiptapType: string): boolean {
  if (tiptapType === 'heading') {
    return /^h[1-6]$/.test(domTag)
  }
  return TIPTAP_TYPE_TO_DOM_TAG[tiptapType] === domTag
}

/**
 * 容器节点类型：需要递归子节点提取批注单元。
 * 这些类型本身不直接作为批注单元（由子节点承担）。
 */
export const CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'doc',
  'bulletList',
  'orderedList',
  'taskList',
])

/**
 * 收集节点子树中的纯文本（跳过 pre/code）。
 */
export function collectNodeText(node: JSONContent): string {
  let text = ''
  const visit = (n: JSONContent) => {
    if (n.type === 'text' && typeof n.text === 'string') text += n.text
    if (n.type === 'hardBreak') text += '\n'
    if (n.type === 'image') text += (n.attrs?.alt as string) ?? ''
    for (const child of n.content ?? []) visit(child)
  }
  for (const child of node.content ?? []) visit(child)
  return text
}
