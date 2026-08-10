import assert from 'node:assert/strict'
import test from 'node:test'
import { BLOCK_ID_PREFIX, type OutlineHeading } from './block-id'
import {
  computeAnchorPreservation,
  ensureOutlineHeadingIds,
  projectAnchorToOutline,
  syncBlockAnchors,
} from './block-anchor-projection'

const OLD_OUTLINE: OutlineHeading[] = [
  { blockId: 'blk_h0_intro01', level: 1, text: '引言', order: 0 },
  { blockId: 'blk_h1_background', level: 2, text: '背景', order: 1 },
  { blockId: 'blk_h2_subprob', level: 3, text: '子问题', order: 2 },
  { blockId: 'blk_h3_solution', level: 2, text: '方案', order: 3 },
  { blockId: 'blk_h4_summary', level: 2, text: '总结', order: 4 },
]

test('projectAnchorToOutline: exact 同 ID 直接命中', () => {
  const r = projectAnchorToOutline({
    sourceOutline: OLD_OUTLINE,
    targetOutline: OLD_OUTLINE,
    sourceAnchorId: 'blk_h2_subprob',
  })
  assert.equal(r.targetBlockId, 'blk_h2_subprob')
  assert.equal(r.matchType, 'exact')
  assert.equal(r.confidence, 1)
})

test('projectAnchorToOutline: 源锚点不存在 => fallback', () => {
  const r = projectAnchorToOutline({
    sourceOutline: OLD_OUTLINE,
    targetOutline: OLD_OUTLINE,
    sourceAnchorId: 'blk_ghost_xxxxx',
  })
  assert.equal(r.targetBlockId, null)
  assert.equal(r.matchType, 'fallback')
  assert.equal(r.confidence, 0)
})

test('projectAnchorToOutline: ID 变更但文本和层级一致 => text 匹配', () => {
  const target: OutlineHeading[] = OLD_OUTLINE.map((o, i) => ({
    ...o,
    blockId: `${BLOCK_ID_PREFIX}rewrite_${i}`,
  }))
  const r = projectAnchorToOutline({
    sourceOutline: OLD_OUTLINE,
    targetOutline: target,
    sourceAnchorId: 'blk_h1_background',
  })
  assert.equal(r.matchType, 'text')
  assert.ok(r.confidence >= 0.7 && r.confidence < 1)
  assert.equal(r.debugInfo.sourceText, '背景')
  assert.equal(r.debugInfo.targetText, '背景')
})

test('projectAnchorToOutline: 文本变了但层级一致，按 order 最近 => level 匹配', () => {
  const target: OutlineHeading[] = [
    { ...OLD_OUTLINE[0], blockId: 'blk_new0', text: '新引言' },
    { ...OLD_OUTLINE[1], blockId: 'blk_new1', text: '新背景' },
    { ...OLD_OUTLINE[2], blockId: 'blk_new2', text: '新子问题' },
    { ...OLD_OUTLINE[3], blockId: 'blk_new3', text: '新方案' },
  ]
  const r = projectAnchorToOutline({
    sourceOutline: OLD_OUTLINE,
    targetOutline: target,
    sourceAnchorId: 'blk_h1_background',
  })
  assert.equal(r.matchType, 'level')
  assert.equal(r.targetBlockId, 'blk_new1')
})

test('projectAnchorToOutline: 层级完全重排，仅按 order 估算', () => {
  const target: OutlineHeading[] = [
    { blockId: 'blk_a', level: 4, text: '别的章节', order: 0 },
    { blockId: 'blk_b', level: 4, text: '另一段', order: 1 },
    { blockId: 'blk_c', level: 4, text: '尾章', order: 2 },
  ]
  const r = projectAnchorToOutline({
    sourceOutline: OLD_OUTLINE,
    targetOutline: target,
    sourceAnchorId: 'blk_h2_subprob',
  })
  assert.equal(r.matchType, 'order')
  assert.equal(r.targetBlockId, 'blk_c')
  assert.ok(r.confidence <= 0.4)
})

test('syncBlockAnchors: 同名同级优先双射，避免一个目标被多个源映射', () => {
  const blocks = [
    { blockId: 'blk_src_a', type: 'heading' as const, level: 2, text: '背景', order: 0 },
    { blockId: 'blk_src_b', type: 'heading' as const, level: 2, text: '背景', order: 1 },
    { blockId: 'blk_src_c', type: 'heading' as const, level: 2, text: '方案', order: 2 },
  ]
  const target: OutlineHeading[] = [
    { blockId: 'blk_tgt_1', level: 2, text: '背景', order: 5 },
    { blockId: 'blk_tgt_2', level: 2, text: '背景', order: 6 },
    { blockId: 'blk_tgt_3', level: 2, text: '方案', order: 7 },
  ]
  const m = syncBlockAnchors({ blocks, targetOutline: target })
  assert.equal(m.size, 3)
  const values = [...m.values()]
  assert.equal(new Set(values).size, 3, '目标应一一对应，不可重复映射')
})

test('syncBlockAnchors: 非 heading 块不参与', () => {
  const blocks = [
    { blockId: 'blk_para', type: 'paragraph' as const, text: '正文', order: 0 },
    { blockId: 'blk_h', type: 'heading' as const, level: 1, text: '标题', order: 1 },
  ]
  const target: OutlineHeading[] = [{ blockId: 'blk_tgt', level: 1, text: '标题', order: 0 }]
  const m = syncBlockAnchors({ blocks, targetOutline: target })
  assert.equal(m.size, 1)
  assert.equal(m.get('blk_h'), 'blk_tgt')
})

test('computeAnchorPreservation: 完整场景', () => {
  const deletedIds = new Set(['blk_h4_summary'])
  const newOutline: OutlineHeading[] = [
    { blockId: 'blk_h0_intro01', level: 1, text: '引言', order: 0 },
    { blockId: 'blk_newbg', level: 2, text: '背景', order: 1 },
    { blockId: 'blk_other', level: 2, text: '新增段落', order: 2 },
    { blockId: 'blk_newsol', level: 2, text: '方案', order: 3 },
  ]
  const result = computeAnchorPreservation({
    oldHeadings: OLD_OUTLINE,
    newHeadings: newOutline,
    deletedIds,
  })
  assert.ok(result.preserved.includes('blk_h0_intro01'), '引言 ID 未变应 preserved')
  assert.ok(result.remapped.some((r) => r.from === 'blk_h1_background' && r.via === 'text'), '背景按文本重映射')
  assert.ok(result.remapped.some((r) => r.from === 'blk_h3_solution'), '方案被重映射')
  assert.ok(!result.lost.includes('blk_h4_summary'), '被显式删除的不应计入 lost')
  assert.ok(result.lost.includes('blk_h2_subprob') || result.remapped.some((r) => r.from === 'blk_h2_subprob'), '子问题或重映射或丢失')
})

test('ensureOutlineHeadingIds: 生成 blk_ 前缀且无重复', () => {
  const raw = [
    { level: 1, text: '第一章', order: 0 },
    { level: 2, text: '背景', order: 1 },
    { level: 2, text: '背景', order: 2 },
  ]
  const outline = ensureOutlineHeadingIds(raw)
  assert.equal(outline.length, 3)
  assert.ok(outline.every((o) => o.blockId.startsWith(BLOCK_ID_PREFIX)))
  const ids = outline.map((o) => o.blockId)
  assert.equal(new Set(ids).size, ids.length, '必须无重复 blockId')
  assert.equal(outline[0].text, '第一章')
  assert.equal(outline[0].level, 1)
})
