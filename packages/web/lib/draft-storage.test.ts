import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONContent } from '@tiptap/core'
import {
  hashDraftContent,
  newDraftId,
  makeNewDraft,
  makeEditDraft,
  updateDraft,
  draftChangedSinceSync,
  markSynced,
  detectConflict,
  formatSaveTime,
  type DraftData,
  type LocalDraft,
} from './draft-storage'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [] }

const SAMPLE_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
}

function baseData(): DraftData {
  return {
    title: '标题',
    content: '正文内容',
    contentDoc: SAMPLE_DOC,
    channel: 'general',
    tags: ['tag1', 'tag2'],
    aiSummary: '摘要',
    font: 'default',
    coverUrl: 'https://example.com/cover.jpg',
    status: 'draft',
  }
}

test('hashDraftContent: 相同输入产生相同哈希', () => {
  const d = baseData()
  const h1 = hashDraftContent(d)
  const h2 = hashDraftContent({ ...d })
  assert.equal(h1, h2)
  assert.equal(typeof h1, 'string')
  assert.ok(h1.length > 0)
})

test('hashDraftContent: 不同字段会产生不同哈希', () => {
  const d = baseData()
  const base = hashDraftContent(d)
  assert.notEqual(hashDraftContent({ ...d, title: '另一个' }), base)
  assert.notEqual(hashDraftContent({ ...d, content: '改了' }), base)
  assert.notEqual(hashDraftContent({ ...d, channel: 'tech' }), base)
  assert.notEqual(hashDraftContent({ ...d, tags: ['x'] }), base)
  assert.notEqual(hashDraftContent({ ...d, aiSummary: 'aa' }), base)
  assert.notEqual(hashDraftContent({ ...d, font: 'other' }), base)
  assert.notEqual(hashDraftContent({ ...d, coverUrl: 'x' }), base)
})

test('newDraftId: 生成唯一且格式可识别的 id', () => {
  const set = new Set<string>()
  for (let i = 0; i < 100; i++) set.add(newDraftId())
  assert.equal(set.size, 100, '应无重复')
  const id = newDraftId()
  assert.ok(id.startsWith('local_'), `应为 local_ 前缀，实际：${id}`)
})

test('makeNewDraft: 正确构造新建草稿', () => {
  const initial = baseData()
  const d = makeNewDraft('user-1', initial)
  assert.equal(d.userId, 'user-1')
  assert.equal(d.source, 'new')
  assert.equal(d.postId, undefined)
  assert.equal(d.title, initial.title)
  assert.equal(d.content, initial.content)
  assert.equal(d.channel, initial.channel)
  assert.deepEqual(d.tags, initial.tags)
  assert.equal(d.aiSummary, initial.aiSummary)
  assert.equal(d.font, initial.font)
  assert.equal(d.coverUrl, initial.coverUrl)
  assert.equal(d.status, 'draft')
  assert.ok(d.id.startsWith('local_'))
  assert.ok(d.createdAt > 0)
  assert.ok(d.updatedAt >= d.createdAt)
  assert.equal(d.syncedContentHash, hashDraftContent(initial))
})

test('makeNewDraft: 无 initial 时提供空默认值', () => {
  const d = makeNewDraft('user-2')
  assert.equal(d.title, '')
  assert.equal(d.content, '')
  assert.deepEqual(d.contentDoc, EMPTY_DOC)
  assert.equal(d.channel, 'general')
  assert.deepEqual(d.tags, [])
  assert.equal(d.status, 'draft')
  assert.ok(d.syncedContentHash)
})

test('makeEditDraft: 正确构造编辑草稿并绑定 postId', () => {
  const server = { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' }
  const d = makeEditDraft('user-3', 'post-42', server)
  assert.equal(d.userId, 'user-3')
  assert.equal(d.postId, 'post-42')
  assert.equal(d.id, 'edit_post-42')
  assert.equal(d.source, 'edit')
  assert.equal(d.title, server.title)
  assert.equal(d.serverUpdatedAt, new Date(server.updatedAt).getTime())
  assert.equal(d.syncedContentHash, hashDraftContent(server))
})

test('updateDraft: 合并 patch 并更新时间戳', () => {
  const d = makeNewDraft('u', { ...baseData(), title: '初始' })
  const before = d.updatedAt
  const updated = updateDraft(d, { title: '修改后', content: '新内容' })
  assert.equal(updated.title, '修改后')
  assert.equal(updated.content, '新内容')
  assert.equal(updated.channel, d.channel, '未被覆盖的字段应保留')
  assert.equal(updated.tags, d.tags, '引用未改值应保留')
  assert.ok(updated.updatedAt >= before, '时间戳应前进或相等')
  assert.notEqual(updated, d, '应返回新对象，不可变更新')
})

test('draftChangedSinceSync: 无同步哈希时视为已更改', () => {
  const d = makeNewDraft('u')
  const withoutHash: LocalDraft = { ...d, syncedContentHash: undefined }
  assert.equal(draftChangedSinceSync(withoutHash), true)
})

test('draftChangedSinceSync: 内容未变时返回 false，变更后返回 true', () => {
  const d = makeNewDraft('u', baseData())
  assert.equal(draftChangedSinceSync(d), false, '刚创建并标记同步，不应变化')
  const modified = updateDraft(d, { title: '改了标题' })
  assert.equal(draftChangedSinceSync(modified), true, '标题变化应检测到')
  const again = updateDraft(d, { channel: 'tech' })
  assert.equal(draftChangedSinceSync(again), true)
})

test('markSynced: 刷新同步哈希和服务器更新时间', () => {
  let d = makeNewDraft('u', baseData())
  d = updateDraft(d, { title: 'x' })
  assert.equal(draftChangedSinceSync(d), true)
  const ts = Date.now()
  const synced = markSynced(d, ts)
  assert.equal(draftChangedSinceSync(synced), false)
  assert.equal(synced.serverUpdatedAt, ts)
  assert.notEqual(synced, d, '不可变更新')
})

test('markSynced: 未传 serverUpdatedAt 时保留原值', () => {
  const base = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  const originalServerTs = base.serverUpdatedAt
  const synced = markSynced(base)
  assert.equal(synced.serverUpdatedAt, originalServerTs)
})

test('detectConflict: 缺少服务器时间时无冲突', () => {
  const local = makeNewDraft('u')
  const info = detectConflict(local, undefined)
  assert.equal(info.hasConflict, false)
  assert.equal(info.diverged, false)
  assert.equal(info.localNewer, false)
  assert.equal(info.serverNewer, false)
  assert.equal(info.serverUpdatedAt, undefined)
})

test('detectConflict: 本地无修改 + 服务器也无修改 => 无冲突', () => {
  const local = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  const info = detectConflict(local, '2025-01-15T10:00:00.000Z')
  assert.equal(info.hasConflict, false)
  assert.equal(info.diverged, false)
  assert.equal(info.localNewer, false)
  assert.equal(info.serverNewer, false)
})

test('detectConflict: 本地改了 + 服务器未改 => localNewer，无冲突', () => {
  let local = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  local = updateDraft(local, { title: '本地改动' })
  const info = detectConflict(local, '2025-01-15T10:00:00.000Z')
  assert.equal(info.hasConflict, false, '服务器没改不应报冲突')
  assert.equal(info.localNewer, true)
  assert.equal(info.serverNewer, false)
  assert.equal(info.diverged, false)
})

test('detectConflict: 本地未改 + 服务器更新 => serverNewer，无冲突', () => {
  const local = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  const info = detectConflict(local, '2025-01-15T12:00:00.000Z')
  assert.equal(info.hasConflict, false)
  assert.equal(info.localNewer, false)
  assert.equal(info.serverNewer, true)
  assert.equal(info.diverged, false)
})

test('detectConflict: 本地改了 + 服务器也改了 => diverged 冲突', () => {
  let local = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  local = updateDraft(local, { title: '本地改动' })
  const info = detectConflict(local, '2025-01-15T12:00:00.000Z')
  assert.equal(info.hasConflict, true)
  assert.equal(info.diverged, true)
  assert.equal(info.localNewer, false)
  assert.equal(info.serverNewer, false)
})

test('detectConflict: 接受数字型时间戳', () => {
  let local = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  local = updateDraft(local, { title: '本地改动' })
  const serverTs = new Date('2025-01-15T12:00:00.000Z').getTime()
  const info = detectConflict(local, serverTs)
  assert.equal(info.hasConflict, true)
  assert.equal(info.diverged, true)
})

test('formatSaveTime: 对最近时间做友好展示', () => {
  const now = Date.now()
  assert.equal(formatSaveTime(now), '刚刚')
  assert.equal(formatSaveTime(now - 30_000), '刚刚')
  assert.match(formatSaveTime(now - 120_000), /^2 分钟前$/)
  assert.match(formatSaveTime(now - 3_600_000 * 2), /^\d{2}:\d{2}$/, '超过 1 小时应输出 HH:MM')
})

test('hashDraftContent: 空字段与缺失字段哈希一致', () => {
  const withEmpty = hashDraftContent({ ...baseData(), aiSummary: '', coverUrl: '' })
  const missing = hashDraftContent({ ...baseData(), aiSummary: '', coverUrl: '' })
  assert.equal(withEmpty, missing)
})

test('updateDraft: 空 patch 仍推进时间戳并返回新对象', () => {
  const d = makeNewDraft('u', baseData())
  const before = d.updatedAt
  const same = updateDraft(d, {})
  assert.notEqual(same, d)
  assert.ok(same.updatedAt >= before)
})

test('updateDraft: 深合并 contentDoc 不要求，浅替换 tags 数组', () => {
  const d = makeNewDraft('u', { ...baseData(), tags: ['a', 'b'] })
  const next = updateDraft(d, { tags: ['c'] })
  assert.deepEqual(next.tags, ['c'])
  assert.notEqual(next.tags, d.tags)
})

test('draftChangedSinceSync: contentDoc 变动也能感知', () => {
  const d0 = makeNewDraft('u', baseData())
  const changedDoc = { ...SAMPLE_DOC, content: [{ type: 'paragraph', content: [{ type: 'text', text: '不一样' }] }] }
  const d1 = updateDraft(d0, { contentDoc: changedDoc })
  assert.equal(draftChangedSinceSync(d1), true)
})

test('markSynced: 同步哈希更新后内容未变则不脏', () => {
  let d = makeNewDraft('u', baseData())
  d = updateDraft(d, { title: '改标题' })
  assert.equal(draftChangedSinceSync(d), true)
  const synced = markSynced(d)
  assert.equal(draftChangedSinceSync(synced), false)
  const samePatch = updateDraft(synced, { title: '改标题' })
  assert.equal(draftChangedSinceSync(samePatch), false)
})

test('detectConflict: 服务器时间戳更早 => 本地较新（非冲突）', () => {
  let local = makeEditDraft('u', 'p', { ...baseData(), updatedAt: '2025-01-15T10:00:00.000Z' })
  local = updateDraft(local, { title: '本地改' })
  const info = detectConflict(local, '2025-01-15T09:00:00.000Z')
  assert.equal(info.hasConflict, false)
  assert.equal(info.localNewer, true)
})

test('detectConflict: 已知服务器时间缺失 => 视作无冲突信息', () => {
  const local = makeNewDraft('u', baseData())
  const info = detectConflict(local, '2025-01-15T12:00:00.000Z')
  assert.equal(info.hasConflict, false)
  assert.equal(info.localUpdatedAt, local.updatedAt)
})

test('newDraftId: 10k 样本低冲突率', () => {
  const n = 10_000
  const seen = new Set<string>()
  for (let i = 0; i < n; i++) seen.add(newDraftId())
  assert.ok(seen.size > n * 0.999, `冲突过多：唯一 ${seen.size}/${n}`)
})

test('makeEditDraft: tags 深拷贝，服务器对象变更不影响草稿', () => {
  const serverTags = ['orig']
  const server = { ...baseData(), tags: serverTags, updatedAt: '2025-01-15T10:00:00.000Z' }
  const draft = makeEditDraft('u', 'p', server)
  serverTags.push('mutated')
  assert.deepEqual(draft.tags, ['orig'])
})
