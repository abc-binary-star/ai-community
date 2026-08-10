import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptCandidate,
  computeDiffStats,
  createAiDiffBlocks,
  createInitialWorkflowState,
  decideAllAiDiffBlocks,
  failPolishRequest,
  mergeEnrichResults,
  pendingAiDiffBlockCount,
  receivePolishCandidate,
  regenerateWithStyle,
  rejectCandidate,
  restoreLastAccepted,
  startPolishRequest,
  updateAiDiffBlock,
  validateEnrichInput,
  type DiffSegment,
} from './ai-diff-workflow'
import { computeDiff } from './text-diff'

test('逐块 Diff 状态只更新目标块', () => {
  const blocks = createAiDiffBlocks([
    { blockId: 'blk_first001', originalMarkdown: '第一段' },
    { blockId: 'blk_second01', originalMarkdown: '第二段' },
  ])
  const updated = updateAiDiffBlock(blocks, 'blk_first001', {
    polishedMarkdown: '润色后的第一段',
    status: 'accepted',
  })
  assert.equal(updated[0].status, 'accepted')
  assert.equal(updated[0].polishedMarkdown, '润色后的第一段')
  assert.equal(updated[1].status, 'pending')
  assert.equal(blocks[0].status, 'pending')
})

test('逐块 Diff 支持全部决策和待审计数', () => {
  const blocks = createAiDiffBlocks([
    { blockId: 'blk_first001', originalMarkdown: '第一段' },
    { blockId: 'blk_second01', originalMarkdown: '第二段' },
  ])
  assert.equal(pendingAiDiffBlockCount(blocks), 2)
  const rejected = decideAllAiDiffBlocks(blocks, 'rejected')
  assert.equal(pendingAiDiffBlockCount(rejected), 0)
  assert.ok(rejected.every((block) => block.status === 'rejected'))
})

test('computeDiffStats: 等长插入删除统计', () => {
  const segs: DiffSegment[] = [
    { op: 'equal', text: 'AB' },
    { op: 'delete', text: '旧词' },
    { op: 'insert', text: '新说法' },
    { op: 'equal', text: 'CD' },
  ]
  const stats = computeDiffStats(segs)
  assert.equal(stats.inserted, 3)
  assert.equal(stats.deleted, 2)
  assert.equal(stats.equal, 4)
})

test('computeDiffStats: 空段返回 0', () => {
  const s = computeDiffStats([])
  assert.deepEqual(s, { inserted: 0, deleted: 0, equal: 0 })
})

test('computeDiffStats: 与 computeDiff 结果兼容', () => {
  const segs = computeDiff('你好旧世界', '你好新世界')
  const stats = computeDiffStats(segs)
  assert.ok(stats.deleted > 0)
  assert.ok(stats.inserted > 0)
})

test('createInitialWorkflowState: 初始值正确', () => {
  const s = createInitialWorkflowState('初始正文')
  assert.equal(s.stage, 'idle')
  assert.equal(s.currentValue, '初始正文')
  assert.equal(s.originalValue, '初始正文')
  assert.equal(s.candidate, null)
  assert.equal(s.history.length, 0)
})

test('startPolishRequest: 无选区 => 全文模式', () => {
  let s = createInitialWorkflowState('这是一段需要润色的正文内容')
  s = startPolishRequest(s)
  assert.equal(s.stage, 'requesting')
  assert.equal(s.originalValue, '这是一段需要润色的正文内容')
  assert.equal(s.selection, null)
  assert.equal(s.candidate, null)
})

test('startPolishRequest: 选区模式 => 记录选区与摘录', () => {
  let s = createInitialWorkflowState('前缀 选中部分 后缀')
  s = startPolishRequest(s, { start: 3, end: 7 })
  assert.equal(s.stage, 'requesting')
  assert.equal(s.originalValue, '选中部分')
  assert.deepEqual(s.selection, { start: 3, end: 7 })
})

test('receivePolishCandidate: 非 requesting 阶段忽略', () => {
  let s = createInitialWorkflowState('原文')
  const after = receivePolishCandidate(s, '润色文', 'formal')
  assert.equal(after.stage, 'idle')
  assert.equal(after.candidate, null)
})

test('receivePolishCandidate: 正常生成候选', () => {
  let s = createInitialWorkflowState('原文需要润色')
  s = startPolishRequest(s)
  s = receivePolishCandidate(s, '润色后的全文', 'natural')
  assert.equal(s.stage, 'previewing')
  assert.ok(s.candidate)
  assert.equal(s.candidate?.original, '原文需要润色')
  assert.equal(s.candidate?.polished, '润色后的全文')
  assert.equal(s.candidate?.style, 'natural')
})

test('failPolishRequest: 记录错误', () => {
  let s = createInitialWorkflowState('原文')
  s = startPolishRequest(s)
  s = failPolishRequest(s, '网络超时')
  assert.equal(s.stage, 'error')
  assert.equal(s.lastError, '网络超时')
  assert.equal(s.candidate, null)
})

test('acceptCandidate: 全文候选替换正文并入历史', () => {
  let s = createInitialWorkflowState('旧的全文')
  s = startPolishRequest(s)
  s = receivePolishCandidate(s, '新的全文', 'natural')
  const before = s.currentValue
  s = acceptCandidate(s)
  assert.equal(s.stage, 'accepted')
  assert.equal(s.currentValue, '新的全文')
  assert.equal(s.candidate, null)
  assert.equal(s.history.length, 1)
  assert.equal(s.history[0].value, before)
  assert.ok(s.history[0].candidateId)
})

test('acceptCandidate: 选区候选局部替换', () => {
  let s = createInitialWorkflowState('前缀 旧词 后缀')
  s = startPolishRequest(s, { start: 3, end: 5 })
  s = receivePolishCandidate(s, '新词', 'friendly')
  s = acceptCandidate(s)
  assert.equal(s.currentValue, '前缀 新词 后缀')
  assert.equal(s.history.length, 1)
})

test('acceptCandidate: 非 previewing 不生效', () => {
  let s = createInitialWorkflowState('原文')
  const unchanged = acceptCandidate(s)
  assert.equal(unchanged.currentValue, '原文')
  assert.equal(unchanged.history.length, 0)
})

test('rejectCandidate: 放弃候选但保留正文原值', () => {
  let s = createInitialWorkflowState('原文')
  s = startPolishRequest(s)
  s = receivePolishCandidate(s, '润色版', 'formal')
  s = rejectCandidate(s)
  assert.equal(s.stage, 'rejected')
  assert.equal(s.currentValue, '原文')
  assert.equal(s.candidate, null)
})

test('restoreLastAccepted: 空历史无操作', () => {
  const s = createInitialWorkflowState('x')
  const r = restoreLastAccepted(s)
  assert.equal(r.currentValue, 'x')
  assert.equal(r.history.length, 0)
})

test('restoreLastAccepted: 回到采纳前的状态', () => {
  let s = createInitialWorkflowState('v1')
  s = startPolishRequest(s)
  s = receivePolishCandidate(s, 'v2', 'formal')
  s = acceptCandidate(s)
  assert.equal(s.currentValue, 'v2')
  s = restoreLastAccepted(s)
  assert.equal(s.currentValue, 'v1')
  assert.equal(s.history.length, 0)
  assert.equal(s.stage, 'idle')
})

test('regenerateWithStyle: 有候选时重置为 requesting', () => {
  let s = createInitialWorkflowState('orig text')
  s = startPolishRequest(s)
  s = receivePolishCandidate(s, 'polished a', 'formal')
  s = regenerateWithStyle(s, 'friendly')
  assert.equal(s.stage, 'requesting')
  assert.equal(s.originalValue, 'orig text')
})

test('validateEnrichInput: 内容太短拒绝', () => {
  const v = validateEnrichInput({ title: '', content: '几个字' })
  assert.equal(v.valid, false)
  assert.match(v.reason ?? '', /至少 10 个字/)
})

test('validateEnrichInput: 内容足够长则放行', () => {
  const v = validateEnrichInput({ title: '', content: '这是一段超过十个字的正文内容' })
  assert.equal(v.valid, true)
  assert.equal(v.reason, undefined)
})

test('mergeEnrichResults: 三项齐全计数为 3', () => {
  const r = mergeEnrichResults({ titles: ['t1', 't2'], summary: 's', tags: ['a', 'b'] })
  assert.equal(r.applied, 3)
  assert.deepEqual(r.titles, ['t1', 't2'])
  assert.equal(r.summary, 's')
  assert.deepEqual(r.tags, ['a', 'b'])
})

test('mergeEnrichResults: 只有标签 => 应用数为 1', () => {
  const r = mergeEnrichResults({ tags: ['only'] })
  assert.equal(r.applied, 1)
  assert.equal(r.titles.length, 0)
  assert.equal(r.summary, '')
})

test('mergeEnrichResults: 全空 => 应用数为 0', () => {
  const r = mergeEnrichResults({})
  assert.equal(r.applied, 0)
})
