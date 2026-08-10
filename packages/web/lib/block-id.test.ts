import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONContent } from '@tiptap/core'
import {
  BLOCK_ID_PREFIX, generateBlockId, isValidBlockId, blockIdFromNode,
  ensureBlockIdAttrs, extractBlocksFromDoc, blocksToOutline, markdownHeadingsToOutline,
} from './block-id'

test('generateBlockId 产出正确前缀与长度', () => {
  const id = generateBlockId()
  assert.equal(typeof id, 'string')
  assert.ok(id.startsWith(BLOCK_ID_PREFIX), `${id} 未以 ${BLOCK_ID_PREFIX} 开头`)
  assert.ok(id.length >= BLOCK_ID_PREFIX.length + 6)
  const ids = new Set([id])
  for (let i = 0; i < 1000; i++) ids.add(generateBlockId())
  assert.equal(ids.size, 1001, '应无冲突')
})

test('isValidBlockId 校验边界', () => {
  assert.equal(isValidBlockId(null), false)
  assert.equal(isValidBlockId(undefined), false)
  assert.equal(isValidBlockId(123), false)
  assert.equal(isValidBlockId(''), false)
  assert.equal(isValidBlockId('blk_'), false)
  assert.equal(isValidBlockId('blk_abcdef'), true)
  assert.equal(isValidBlockId('BLK_abcdef'), false)
})

test('blockIdFromNode 从 node.attrs 取值', () => {
  assert.equal(blockIdFromNode({ attrs: { blockId: 'blk_abc123' } }), 'blk_abc123')
  assert.equal(blockIdFromNode({ attrs: {} }), null)
  assert.equal(blockIdFromNode({ attrs: { blockId: 'bad' } }), null)
  assert.equal(blockIdFromNode({}), null)
})

test('ensureBlockIdAttrs 保留已有合法 id，缺则新造', () => {
  const a = ensureBlockIdAttrs({ foo: 1 })
  assert.ok(isValidBlockId(a.blockId))
  assert.equal(a.foo, 1)

  const b = ensureBlockIdAttrs({ blockId: 'blk_existing01' })
  assert.equal(b.blockId, 'blk_existing01')

  const c = ensureBlockIdAttrs({ blockId: 'invalid' })
  assert.notEqual(c.blockId, 'invalid')
  assert.ok(isValidBlockId(c.blockId))
})

test('extractBlocksFromDoc 只抽取含 blockId 的原子块并收集文本', () => {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1, blockId: 'blk_h1_first01' }, content: [{ type: 'text', text: '第一章' }] },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            attrs: { blockId: 'blk_li_wrap001' },
            content: [
              { type: 'paragraph', attrs: { blockId: 'blk_p_li0_para' }, content: [{ type: 'text', text: '列表文本A' }] },
            ],
          },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '无 id 段落不抽取' }] },
      {
        type: 'blockquote',
        attrs: { blockId: 'blk_bq_container01' },
        content: [
          { type: 'paragraph', attrs: { blockId: 'blk_p_quote_par' }, content: [{ type: 'text', text: '引用中的段' }] },
        ],
      },
    ],
  }
  const blocks = extractBlocksFromDoc(doc)
  const ids = blocks.map((b) => b.blockId)
  assert.deepEqual(ids, ['blk_h1_first01', 'blk_p_li0_para', 'blk_p_quote_par'])
  assert.equal(blocks.find((b) => b.blockId === 'blk_h1_first01')?.type, 'heading')
  assert.equal(blocks.find((b) => b.blockId === 'blk_h1_first01')?.level, 1)
  assert.equal(blocks.find((b) => b.blockId === 'blk_h1_first01')?.text, '第一章')
  assert.equal(blocks.find((b) => b.blockId === 'blk_p_li0_para')?.text, '列表文本A')
  assert.equal(blocks.find((b) => b.blockId === 'blk_p_quote_par')?.text, '引用中的段')
  assert.equal(blocks.find((b) => b.blockId === 'blk_p_quote_par')?.order, 2)
})

test('blocksToOutline 仅返回标题并按 order 排序', () => {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { blockId: 'blk_p1_intro001' }, content: [{ type: 'text', text: '引言' }] },
      { type: 'heading', attrs: { level: 2, blockId: 'blk_h2_1_abcdef' }, content: [{ type: 'text', text: '背景' }] },
      { type: 'heading', attrs: { level: 3, blockId: 'blk_h3_1_abcdef' }, content: [{ type: 'text', text: '子问题' }] },
      { type: 'heading', attrs: { level: 2, blockId: 'blk_h2_2_abcdef' }, content: [{ type: 'text', text: '方案' }] },
      { type: 'heading', attrs: { level: 1, blockId: 'blk_h1_empty001' }, content: [] },
    ],
  }
  const outline = blocksToOutline(extractBlocksFromDoc(doc))
  assert.equal(outline.length, 3)
  assert.equal(outline[0].level, 2)
  assert.equal(outline[0].text, '背景')
  assert.equal(outline[1].level, 3)
  assert.equal(outline[1].text, '子问题')
  assert.equal(outline[2].level, 2)
  assert.equal(outline[2].text, '方案')
})

test('markdownHeadingsToOutline 跳过代码块内的伪标题并正确去前后 #', () => {
  const md = [
    '# 引言',
    '',
    '正文段落',
    '',
    '## 背景',
    '',
    '```',
    '# not a heading',
    '```',
    '',
    '### 子标题 ##',
    '',
    '###### 最底级',
    '',
    '##',
  ].join('\n')
  const outline = markdownHeadingsToOutline(md)
  assert.equal(outline.length, 4)
  assert.equal(outline[0].level, 1)
  assert.equal(outline[0].text, '引言')
  assert.equal(outline[1].level, 2)
  assert.equal(outline[1].text, '背景')
  assert.equal(outline[2].level, 3)
  assert.equal(outline[2].text, '子标题')
  assert.equal(outline[3].level, 6)
  assert.equal(outline[3].text, '最底级')
  const ids = outline.map((o) => o.blockId)
  assert.ok(ids.every((s) => s.startsWith(BLOCK_ID_PREFIX)))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(outline[0].order, 0)
  assert.equal(outline[3].order, 3)
})
