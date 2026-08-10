import type { JSONContent } from '@tiptap/core'
import { isValidBlockId } from './block-id'
import {
  ANCHORABLE_TIPTAP_TYPES,
  CONTAINER_TYPES,
  collectNodeText,
} from './anchorable-blocks'

/**
 * 内容块描述符：从 contentDoc 提取的可批注块元数据。
 * 阅读页消费此列表，按类型和顺序将稳定 blockId 投影到 DOM。
 */
export interface ContentBlockDescriptor {
  /** 稳定 blockId，来自 Tiptap attrs */
  blockId: string
  /** Tiptap 节点类型：paragraph / heading / blockquote / listItem / taskItem */
  type: string
  /** 块内纯文本（跳过 pre/code） */
  text: string
  /** 在文档中的出现顺序 */
  order: number
  /** 嵌套深度（顶层为 0） */
  depth: number
  /** 父块 blockId（如有） */
  parentBlockId?: string
}

export interface ExtractOptions {
  /** 检测到重复 blockId 时是否自动重新生成 */
  regenerateDuplicates?: boolean
}

export interface ExtractResult {
  descriptors: ContentBlockDescriptor[]
  /** 检测到的重复 blockId 列表 */
  duplicateIds: string[]
  /** 检测到的非法 blockId 数量 */
  invalidCount: number
}

/**
 * 从 Tiptap JSON 文档提取可批注块描述符列表。
 *
 * 规则：
 * - paragraph/heading/blockquote/listItem/taskItem 是批注单元，直接提取。
 * - bulletList/orderedList/taskList 是容器，递归子节点。
 * - blockquote 的内部 paragraph 不单独成为描述符。
 * - listItem/taskItem 的内部 paragraph 不单独成为描述符。
 * - 非法或重复的 blockId 被记录但不阻断提取。
 */
export function extractContentBlockDescriptors(
  doc: JSONContent,
  options: ExtractOptions = {},
): ExtractResult {
  const descriptors: ContentBlockDescriptor[] = []
  const duplicateIds: string[] = []
  const seenIds = new Set<string>()
  let invalidCount = 0
  let order = 0

  const visit = (node: JSONContent, depth: number, parentBlockId?: string) => {
    if (!node || typeof node !== 'object') return
    const type = node.type ?? ''

    // 容器节点：递归子节点
    if (CONTAINER_TYPES.has(type)) {
      for (const child of node.content ?? []) {
        visit(child, depth, parentBlockId)
      }
      return
    }

    // 可批注单元：提取描述符
    if (ANCHORABLE_TIPTAP_TYPES.has(type)) {
      const rawId = node.attrs?.blockId
      let blockId: string | null = null

      if (isValidBlockId(rawId)) {
        if (seenIds.has(rawId)) {
          duplicateIds.push(rawId)
          // 重复 ID：不绑定，记录但不生成新 ID（由调用方决定是否修复）
        } else {
          seenIds.add(rawId)
          blockId = rawId
        }
      } else if (rawId !== undefined && rawId !== null) {
        invalidCount += 1
      }

      if (blockId) {
        descriptors.push({
          blockId,
          type,
          text: collectNodeText(node),
          order: order++,
          depth,
          parentBlockId,
        })
      }

      // 不再递归子节点：blockquote/listItem/taskItem 的内部 paragraph 不单独提取
      return
    }

    // 其他块级节点（codeBlock/horizontalRule/image）：跳过，不递归
  }

  if (doc.type === 'doc' && doc.content) {
    for (const child of doc.content) {
      visit(child, 0)
    }
  }

  return { descriptors, duplicateIds, invalidCount }
}
