import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accumulatePatch,
  computeIsDirty,
  concludeSave,
  createAutosaveAccumulator,
  flushAccumulated,
  planConflictResolution,
  transitionSaveStatus,
  type SaveStatus,
  type SaveStatusTransitionEvent,
} from './autosave-logic'
import { makeNewDraft, updateDraft, type DraftData } from './draft-storage'

function baseData(): DraftData {
  return {
    title: '标题',
    content: '正文内容',
    contentDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文内容' }] }] },
    channel: 'general',
    tags: ['tag1', 'tag2'],
    aiSummary: '摘要',
    font: 'default',
    coverUrl: 'https://example.com/cover.jpg',
    status: 'draft',
  }
}

test('createAutosaveAccumulator: 初始状态正确', () => {
  const acc = createAutosaveAccumulator()
  assert.equal(acc.pendingPatch, null)
  assert.equal(acc.lastFlownAt, 0)
  assert.equal(acc.saveInFlight, false)
})

test('accumulatePatch: 首个 patch 正确写入', () => {
  let acc = createAutosaveAccumulator()
  acc = accumulatePatch(acc, { title: '新标题' })
  assert.deepEqual(acc.pendingPatch, { title: '新标题' })
})

test('accumulatePatch: 多次 patch 合并，后者覆盖前者', () => {
  let acc = createAutosaveAccumulator()
  acc = accumulatePatch(acc, { title: '第一版', content: '内容A' })
  acc = accumulatePatch(acc, { title: '第二版', channel: 'tech' })
  assert.equal(acc.pendingPatch?.title, '第二版')
  assert.equal(acc.pendingPatch?.content, '内容A')
  assert.equal(acc.pendingPatch?.channel, 'tech')
})

test('flushAccumulated: 无 draft 时不保存', () => {
  const acc = accumulatePatch(createAutosaveAccumulator(), { title: 'x' })
  const result = flushAccumulated(acc, null, Date.now())
  assert.equal(result.shouldSave, false)
  assert.equal(result.nextDraft, null)
  assert.equal(result.newAcc.pendingPatch, null)
})

test('flushAccumulated: saveInFlight 时跳过避免重入', () => {
  let acc = accumulatePatch(createAutosaveAccumulator(), { title: 'x' })
  acc.saveInFlight = true
  const draft = makeNewDraft('u1', baseData())
  const result = flushAccumulated(acc, draft, Date.now())
  assert.equal(result.shouldSave, false)
  assert.equal(result.newAcc.saveInFlight, true)
  assert.equal(result.newAcc.pendingPatch, acc.pendingPatch)
})

test('flushAccumulated: 无 patch 但应保存原 draft', () => {
  const acc = createAutosaveAccumulator()
  const draft = makeNewDraft('u1', baseData())
  const result = flushAccumulated(acc, draft, 1000)
  assert.equal(result.shouldSave, true)
  assert.equal(result.nextDraft?.id, draft.id)
  assert.equal(result.newAcc.saveInFlight, true)
  assert.equal(result.newAcc.lastFlownAt, 1000)
  assert.equal(result.newAcc.pendingPatch, null)
})

test('flushAccumulated: 有 patch 则合并更新', () => {
  const acc = accumulatePatch(createAutosaveAccumulator(), { title: '已改标题' })
  const draft = makeNewDraft('u1', baseData())
  const before = draft.updatedAt
  const result = flushAccumulated(acc, draft, 1000)
  assert.equal(result.shouldSave, true)
  assert.equal(result.nextDraft?.title, '已改标题')
  assert.ok(result.nextDraft && result.nextDraft.updatedAt >= before)
})

test('concludeSave: 释放 saveInFlight 锁', () => {
  const acc = createAutosaveAccumulator()
  acc.saveInFlight = true
  const after = concludeSave(acc)
  assert.equal(after.saveInFlight, false)
  assert.equal(after.pendingPatch, acc.pendingPatch)
})

const saveTransitions: Array<[SaveStatus, SaveStatusTransitionEvent, SaveStatus]> = [
  ['idle', 'edit', 'idle'],
  ['idle', 'start_save', 'saving'],
  ['saving', 'edit', 'saving'],
  ['saving', 'save_success', 'saved'],
  ['saving', 'save_error', 'error'],
  ['saved', 'edit', 'idle'],
  ['saved', 'start_save', 'saving'],
  ['error', 'edit', 'idle'],
  ['error', 'start_save', 'saving'],
  ['error', 'ack_error', 'idle'],
  ['idle', 'save_success', 'idle'],
]

for (const [from, evt, to] of saveTransitions) {
  test(`transitionSaveStatus: ${from} + ${evt} -> ${to}`, () => {
    assert.equal(transitionSaveStatus(from, evt), to)
  })
}

test('computeIsDirty: null draft 不脏', () => {
  assert.equal(computeIsDirty({ draft: null, pendingPatch: null }), false)
})

test('computeIsDirty: 只要有 pendingPatch 就视为脏', () => {
  const draft = makeNewDraft('u1', baseData())
  assert.equal(computeIsDirty({ draft, pendingPatch: { title: 'x' } }), true)
})

test('computeIsDirty: 无 patch 但内容偏离同步哈希则脏', () => {
  const d0 = makeNewDraft('u1', baseData())
  const modified = updateDraft(d0, { content: '改了正文' })
  assert.equal(computeIsDirty({ draft: modified, pendingPatch: null }), true)
})

test('computeIsDirty: 新草稿同步后不脏', () => {
  const d = makeNewDraft('u1', baseData())
  assert.equal(computeIsDirty({ draft: d, pendingPatch: null }), false)
})

test('planConflictResolution: 无冲突 + localNewer => 本地覆盖', () => {
  const plan = planConflictResolution(false, true, false, false)
  assert.equal(plan.choice, 'use-local')
  assert.equal(plan.shouldDeleteOldDraft, false)
  assert.equal(plan.shouldNotifyUser, false)
})

test('planConflictResolution: 无冲突 + serverNewer => 接受服务器', () => {
  const plan = planConflictResolution(false, false, true, false)
  assert.equal(plan.choice, 'accept-server')
  assert.equal(plan.shouldDeleteOldDraft, true)
})

test('planConflictResolution: 冲突 diverged => 默认保留本地并通知', () => {
  const plan = planConflictResolution(true, false, false, true)
  assert.equal(plan.choice, 'use-local')
  assert.equal(plan.shouldNotifyUser, true)
  assert.equal(plan.shouldDeleteOldDraft, false)
})

test('planConflictResolution: 冲突用户选 accept-server => 删除旧草稿', () => {
  const plan = planConflictResolution(true, false, false, true, 'accept-server')
  assert.equal(plan.choice, 'accept-server')
  assert.equal(plan.shouldDeleteOldDraft, true)
})

test('planConflictResolution: 冲突用户选 discard-local => 删除', () => {
  const plan = planConflictResolution(true, false, false, true, 'discard-local')
  assert.equal(plan.choice, 'discard-local')
  assert.equal(plan.shouldDeleteOldDraft, true)
})
