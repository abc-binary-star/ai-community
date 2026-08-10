import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectVirtualKeyboard,
  isActionActive,
  parseSafeAreaBottom,
  type EditorAction,
  type EditorStateSnapshot,
} from './mobile-toolbar-logic'

test('parseSafeAreaBottom: 从 CSS var 中解析像素值', () => {
  assert.equal(parseSafeAreaBottom({ cssVarValue: '34px' }), 34)
  assert.equal(parseSafeAreaBottom({ cssVarValue: '20.5' }), 20.5)
  assert.equal(parseSafeAreaBottom({ cssVarValue: '' }), 0)
})

test('parseSafeAreaBottom: CSS var 缺失时回退视口差值判断', () => {
  const r1 = parseSafeAreaBottom({ cssVarValue: '', windowHeight: 800, viewportHeight: 600 })
  assert.equal(r1, 0, '视口差大于 0 时说明有键盘，不作为安全区')
  const r2 = parseSafeAreaBottom({ cssVarValue: '', windowHeight: 800, viewportHeight: 800 })
  assert.equal(r2, 0)
})

test('detectVirtualKeyboard: visualViewport 差值 > 120 判为键盘弹起', () => {
  const r = detectVirtualKeyboard({
    windowHeight: 900,
    viewportHeight: 600,
    lastFocusTs: 0,
    nowTs: 1000,
    activeElementInContainer: false,
    safeAreaBottom: 0,
  })
  assert.equal(r.keyboardOpen, true)
  assert.equal(r.keyboardHeight, 300)
})

test('detectVirtualKeyboard: 差值小但近期聚焦且元素在容器内 => 按 safeArea+260 兜底', () => {
  const r = detectVirtualKeyboard({
    windowHeight: 800,
    viewportHeight: 750,
    lastFocusTs: 9600,
    nowTs: 10000,
    activeElementInContainer: true,
    safeAreaBottom: 40,
  })
  assert.equal(r.keyboardOpen, true)
  assert.equal(r.keyboardHeight, 300)
})

test('detectVirtualKeyboard: 聚焦超时且视口差不足 => 键盘关闭', () => {
  const r = detectVirtualKeyboard({
    windowHeight: 800,
    viewportHeight: 780,
    lastFocusTs: 9000,
    nowTs: 10000,
    activeElementInContainer: true,
    safeAreaBottom: 0,
  })
  assert.equal(r.keyboardOpen, false)
  assert.equal(r.keyboardHeight, 0)
})

test('detectVirtualKeyboard: 聚焦时间很近但元素不在容器内 => 不开', () => {
  const r = detectVirtualKeyboard({
    windowHeight: 800,
    viewportHeight: 800,
    lastFocusTs: 9900,
    nowTs: 10000,
    activeElementInContainer: false,
    safeAreaBottom: 0,
  })
  assert.equal(r.keyboardOpen, false)
})

function emptyState(): EditorStateSnapshot {
  return {
    activeMarks: new Set(),
    activeNodes: new Map(),
    canUndo: false,
    canRedo: false,
  }
}

test('isActionActive: 粗体、斜体、删除线、行内代码按 marks 判断', () => {
  const s = emptyState()
  s.activeMarks = new Set(['bold', 'italic'])
  assert.equal(isActionActive('bold', s), true)
  assert.equal(isActionActive('italic', s), true)
  assert.equal(isActionActive('strike', s), false)
  assert.equal(isActionActive('code', s), false)
})

test('isActionActive: h2 必须 heading 节点且 level===2', () => {
  const s = emptyState()
  s.activeNodes = new Map([['heading', { level: 2 }]])
  assert.equal(isActionActive('h2', s), true)
  const s2 = emptyState()
  s2.activeNodes = new Map([['heading', { level: 3 }]])
  assert.equal(isActionActive('h2', s2), false)
})

test('isActionActive: 列表 / 引用 / 代码块按 activeNodes key 存在', () => {
  const pairs: Array<[EditorAction, string]> = [
    ['bullet', 'bulletList'],
    ['ordered', 'orderedList'],
    ['todo', 'taskList'],
    ['quote', 'blockquote'],
    ['codeblock', 'codeBlock'],
  ]
  for (const [action, nodeKey] of pairs) {
    const s = emptyState()
    s.activeNodes = new Map([[nodeKey, {}]])
    assert.equal(isActionActive(action, s), true)
    assert.equal(isActionActive(action, emptyState()), false)
  }
})

test('isActionActive: link 通过 mark 判断', () => {
  const s = emptyState()
  s.activeMarks = new Set(['link'])
  assert.equal(isActionActive('link', s), true)
})

test('isActionActive: paragraph 激活需要 paragraph 节点存在且不在 heading 中', () => {
  const s1 = emptyState()
  s1.activeNodes = new Map([['paragraph', {}]])
  assert.equal(isActionActive('paragraph', s1), true)

  const s2 = emptyState()
  s2.activeNodes = new Map([['paragraph', {}], ['heading', { level: 2 }]])
  assert.equal(isActionActive('paragraph', s2), false)
})
