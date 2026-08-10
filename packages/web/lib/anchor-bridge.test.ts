import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONContent } from '@tiptap/core'
import {
  buildParagraphAnchor,
  buildSelectionAnchor,
  parseAnchor,
  resolveAnchor,
} from './anchor-bridge'

const DOC: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2, blockId: 'blk_heading01' },
      content: [{ type: 'text', text: '第一节' }],
    },
    {
      type: 'paragraph',
      attrs: { blockId: 'blk_paragraph01' },
      content: [{ type: 'text', text: '这是一段正文内容' }],
    },
  ],
}

test('构建和解析 block 段落锚点', () => {
  const raw = buildParagraphAnchor('blk_paragraph01')
  assert.equal(raw, 'blk:block:blk_paragraph01')
  assert.deepEqual(parseAnchor(raw), {
    kind: 'block',
    blockId: 'blk_paragraph01',
    startOffset: 0,
    length: 0,
  })
})

test('构建和解析 block 选区锚点', () => {
  const raw = buildSelectionAnchor('blk_paragraph01', 2, 4)
  assert.equal(raw, 'blk:block:blk_paragraph01:2:4')
  assert.deepEqual(parseAnchor(raw), {
    kind: 'block',
    blockId: 'blk_paragraph01',
    startOffset: 2,
    length: 4,
  })
})

test('解析 Markdown offset 锚点', () => {
  assert.deepEqual(parseAnchor('md:range:3:8'), {
    kind: 'markdown',
    start: 3,
    end: 8,
  })
})

test('兼容旧的裸 blockId 锚点', () => {
  assert.deepEqual(parseAnchor('blk_paragraph01'), {
    kind: 'block',
    blockId: 'blk_paragraph01',
    startOffset: 0,
    length: 0,
  })
})

test('resolveAnchor 定位当前文档中的稳定 blockId', () => {
  const resolved = resolveAnchor('blk:block:blk_paragraph01:2:4', { doc: DOC })
  assert.equal(resolved.orphaned, false)
  assert.equal(resolved.blockId, 'blk_paragraph01')
  assert.equal(resolved.paragraphPreview, '这是一段正文内容')
  assert.deepEqual(resolved.resolved, {
    kind: 'block',
    blockId: 'blk_paragraph01',
    startOffset: 2,
    length: 4,
  })
})

test('resolveAnchor 将不存在的 blockId 标记为 orphaned', () => {
  const resolved = resolveAnchor('blk:block:blk_deleted01:0:2', { doc: DOC })
  assert.equal(resolved.orphaned, true)
  assert.equal(resolved.blockId, 'blk_deleted01')
})

test('resolveAnchor 兼容并裁剪 Markdown offset', () => {
  const resolved = resolveAnchor('md:range:2:50', { doc: 'abcdef' })
  assert.equal(resolved.orphaned, false)
  assert.deepEqual(resolved.resolved, { kind: 'markdown', start: 2, end: 6 })
})

test('未知锚点格式安全降级为 orphaned', () => {
  const resolved = resolveAnchor('unknown-anchor', { doc: DOC })
  assert.equal(resolved.orphaned, true)
  assert.deepEqual(resolved.resolved, { kind: 'whole' })
})
