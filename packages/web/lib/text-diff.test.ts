import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCandidateToValue,
  applySelectionToValue,
  candidateDiffSegments,
  computeDiff,
  createPolishCandidate,
  extractSelection,
  type DiffSegment,
} from './text-diff'

test('computeDiff 完全相同的文本返回单个 equal 段', () => {
  const segs = computeDiff('hello world', 'hello world')
  assert.equal(segs.length, 1)
  assert.equal(segs[0].op, 'equal')
  assert.equal(segs[0].text, 'hello world')
})

test('computeDiff 空文本返回空数组', () => {
  assert.deepEqual(computeDiff('', ''), [])
})

test('computeDiff 纯新增内容被标记为 insert', () => {
  const segs = computeDiff('', '新增文字')
  assert.equal(segs.length, 1)
  assert.equal(segs[0].op, 'insert')
  assert.equal(segs[0].text, '新增文字')
})

test('computeDiff 纯删除内容被标记为 delete', () => {
  const segs = computeDiff('旧内容已删', '')
  assert.equal(segs.length, 1)
  assert.equal(segs[0].op, 'delete')
  assert.equal(segs[0].text, '旧内容已删')
})

test('computeDiff 中文替换：删除旧词并插入新词', () => {
  const segs = computeDiff('这个方案非常不好', '这个方案非常棒')
  const ops = segs.map((s) => s.op)
  assert.ok(ops.includes('delete'), '应存在 delete 段')
  assert.ok(ops.includes('insert'), '应存在 insert 段')
  const restored = segs.reduce((acc, s) => {
    if (s.op === 'equal' || s.op === 'delete') return acc + s.text
    return acc
  }, '')
  assert.equal(restored, '这个方案非常不好')
  const polished = segs.reduce((acc, s) => {
    if (s.op === 'equal' || s.op === 'insert') return acc + s.text
    return acc
  }, '')
  assert.equal(polished, '这个方案非常棒')
})

test('computeDiff 英文替换：整词为单位', () => {
  const segs = computeDiff('The quick brown fox', 'The fast brown fox')
  const ops = segs.map((s) => s.op)
  assert.ok(ops.includes('delete'))
  assert.ok(ops.includes('insert'))
  const joined = (segs: DiffSegment[], accept: Set<string>) =>
    segs.filter((s) => accept.has(s.op)).map((s) => s.text).join('')
  assert.equal(joined(segs, new Set(['equal', 'delete'])), 'The quick brown fox')
  assert.equal(joined(segs, new Set(['equal', 'insert'])), 'The fast brown fox')
})

test('computeDiff 包含标点和空白的混合修改', () => {
  const before = '你好，世界！今天天气不错。'
  const after = '你好呀，世界！今天的天气真不错。'
  const segs = computeDiff(before, after)
  assert.ok(segs.length >= 3)
  for (const seg of segs) {
    assert.ok(['equal', 'insert', 'delete'].includes(seg.op))
  }
})

test('applySelectionToValue 正确替换选区内容', () => {
  const value = '0123456789'
  const replaced = applySelectionToValue(value, { start: 3, end: 6 }, 'ABC')
  assert.equal(replaced, '012ABC6789')
})

test('applySelectionToValue 空选区等于在光标处插入', () => {
  const value = '012345'
  const inserted = applySelectionToValue(value, { start: 3, end: 3 }, 'XX')
  assert.equal(inserted, '012XX345')
})

test('extractSelection 正确截取选区', () => {
  assert.equal(extractSelection('abcdef', { start: 1, end: 4 }), 'bcd')
  assert.equal(extractSelection('abcdef', { start: 0, end: 0 }), '')
  assert.equal(extractSelection('abcdef', { start: 0, end: 6 }), 'abcdef')
})

test('createPolishCandidate 生成带 id 和时间戳的候选', () => {
  const c1 = createPolishCandidate('原稿', '润色稿', 'formal', { start: 0, end: 2 })
  const c2 = createPolishCandidate('原稿', '润色稿', 'formal')
  assert.ok(c1.id.length > 0)
  assert.ok(c2.id.length > 0)
  assert.notEqual(c1.id, c2.id)
  assert.equal(c1.original, '原稿')
  assert.equal(c1.polished, '润色稿')
  assert.equal(c1.style, 'formal')
  assert.deepEqual(c1.selection, { start: 0, end: 2 })
  assert.equal(c2.selection, undefined)
  assert.ok(c1.createdAt <= Date.now())
  assert.ok(c1.createdAt > Date.now() - 1000)
})

test('applyCandidateToValue 全文候选替换整篇正文', () => {
  const cand = createPolishCandidate('旧的全文', '新的全文', 'natural')
  assert.equal(applyCandidateToValue('旧的全文', cand), '新的全文')
})

test('applyCandidateToValue 选区候选仅替换选中范围', () => {
  const cand = createPolishCandidate('前缀 旧词 后缀', '新词', 'natural', { start: 3, end: 5 })
  const result = applyCandidateToValue('前缀 旧词 后缀', cand)
  assert.equal(result, '前缀 新词 后缀')
})

test('candidateDiffSegments 全文候选对整段计算 diff', () => {
  const cand = createPolishCandidate('hello world', 'hello world!', 'natural')
  const segs = candidateDiffSegments(cand)
  assert.ok(segs.some((s) => s.op === 'insert' && s.text === '!'))
})

test('candidateDiffSegments 选区候选只比较选中片段', () => {
  const cand = createPolishCandidate(
    '前缀 old 后缀',
    'new',
    'friendly',
    { start: 3, end: 6 },
  )
  const segs = candidateDiffSegments(cand)
  const hasDeleteOld = segs.some((s) => s.op === 'delete' && s.text.includes('old'))
  const hasInsertNew = segs.some((s) => s.op === 'insert' && s.text.includes('new'))
  assert.ok(hasDeleteOld, 'diff 应包含 delete old')
  assert.ok(hasInsertNew, 'diff 应包含 insert new')
  const noPrefix = !segs.some((s) => s.text.includes('前缀') || s.text.includes('后缀'))
  assert.ok(noPrefix, '选区 diff 不应包含选区外的上下文')
})
