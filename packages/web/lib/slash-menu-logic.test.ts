import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectSlashCommand,
  filterSlashItems,
  wrapActiveIndex,
  type SlashItem,
} from './slash-menu-logic'

function makeStubItem(overrides: Partial<SlashItem>): SlashItem {
  return {
    key: 'paragraph',
    label: '正文',
    desc: '普通段落',
    icon: null,
    run() {},
    ...overrides,
  }
}

const STUB_ITEMS: SlashItem[] = [
  makeStubItem({ key: 'h1', label: '一级标题', keywords: ['h1', 'title', '一级', '标题'] }),
  makeStubItem({ key: 'h2', label: '二级标题', keywords: ['h2', 'subtitle', '二级'] }),
  makeStubItem({ key: 'bullet', label: '无序列表', keywords: ['ul', 'list', '无序'] }),
  makeStubItem({ key: 'ordered', label: '有序列表', keywords: ['ol', '有序'] }),
  makeStubItem({ key: 'quote', label: '引用块', keywords: ['blockquote', '引用'] }),
  makeStubItem({ key: 'code', label: '代码块', keywords: ['codeblock', '代码块'] }),
  makeStubItem({ key: 'image', label: '图片', keywords: ['img', 'image', '图片'] }),
]

test('filterSlashItems: 空 query 返回全部', () => {
  const r = filterSlashItems({ query: '', items: STUB_ITEMS })
  assert.equal(r.length, STUB_ITEMS.length)
})

test('filterSlashItems: 前后空白 + 大小写不敏感', () => {
  const r = filterSlashItems({ query: '  H1  ', items: STUB_ITEMS })
  assert.ok(r.some((i) => i.key === 'h1'))
  assert.ok(!r.some((i) => i.key === 'h2'))
})

test('filterSlashItems: 按 label 模糊匹配', () => {
  const r = filterSlashItems({ query: '列表', items: STUB_ITEMS })
  assert.equal(r.length, 2)
  assert.ok(r.some((i) => i.key === 'bullet'))
  assert.ok(r.some((i) => i.key === 'ordered'))
})

test('filterSlashItems: 按 key 精确命中', () => {
  const r = filterSlashItems({ query: 'code', items: STUB_ITEMS })
  assert.ok(r.some((i) => i.key === 'code'))
})

test('filterSlashItems: 关键词匹配', () => {
  const byImg = filterSlashItems({ query: 'img', items: STUB_ITEMS })
  assert.ok(byImg.some((i) => i.key === 'image'))
  const byQuote = filterSlashItems({ query: 'blockquote', items: STUB_ITEMS })
  assert.ok(byQuote.some((i) => i.key === 'quote'))
})

test('filterSlashItems: 无匹配返回空数组', () => {
  const r = filterSlashItems({ query: '不存在的命令关键字', items: STUB_ITEMS })
  assert.deepEqual(r, [])
})

test('detectSlashCommand: 无前导 / 不打开', () => {
  const r = detectSlashCommand({ textBefore: '这里没有斜杠', selectionFrom: 6 })
  assert.equal(r.shouldOpen, false)
})

test('detectSlashCommand: / 后含空白则关闭', () => {
  const r = detectSlashCommand({ textBefore: '前缀 /h1 后缀', selectionFrom: 12 })
  assert.equal(r.shouldOpen, false)
})

test('detectSlashCommand: / 后紧跟纯查询字符串，计算 range 正确', () => {
  const textBefore = '正文 /h2'
  const selFrom = textBefore.length
  const r = detectSlashCommand({ textBefore, selectionFrom: selFrom })
  assert.equal(r.shouldOpen, true)
  assert.equal(r.query, 'h2')
  const slashPos = textBefore.lastIndexOf('/')
  assert.equal(r.rangeFrom, slashPos)
  assert.equal(r.rangeTo, selFrom)
})

test('detectSlashCommand: 只输入 / ，query 为空但应打开', () => {
  const textBefore = '正文 /'
  const r = detectSlashCommand({ textBefore, selectionFrom: textBefore.length })
  assert.equal(r.shouldOpen, true)
  assert.equal(r.query, '')
})

test('detectSlashCommand: 多个 / 取最后一个', () => {
  const textBefore = '开头 /abc /h3'
  const r = detectSlashCommand({ textBefore, selectionFrom: textBefore.length })
  assert.equal(r.shouldOpen, true)
  assert.equal(r.query, 'h3')
  const expectedFrom = textBefore.lastIndexOf('/')
  assert.equal(r.rangeFrom, expectedFrom)
})

test('wrapActiveIndex: 空列表安全处理为 1 项取模', () => {
  assert.equal(wrapActiveIndex(0, 0, 1), 0)
  assert.equal(wrapActiveIndex(0, 0, -1), 0)
})

test('wrapActiveIndex: 向下循环', () => {
  assert.equal(wrapActiveIndex(0, 5, 1), 1)
  assert.equal(wrapActiveIndex(4, 5, 1), 0)
})

test('wrapActiveIndex: 向上循环越界回卷', () => {
  assert.equal(wrapActiveIndex(0, 5, -1), 4)
  assert.equal(wrapActiveIndex(1, 5, -2), 4)
})

test('wrapActiveIndex: 大步长 delta 也能正确取模', () => {
  assert.equal(wrapActiveIndex(0, 3, 10), 1)
  assert.equal(wrapActiveIndex(1, 3, -10), 0)
})
