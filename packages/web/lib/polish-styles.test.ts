import assert from 'node:assert/strict'
import test from 'node:test'
import { POLISH_STYLES, polishStyleLabel } from './polish-styles'

test('POLISH_STYLES 包含 4 种风格且键名唯一', () => {
  assert.equal(POLISH_STYLES.length, 4)
  const keys = POLISH_STYLES.map((s) => s.key)
  assert.deepEqual(keys, [...new Set(keys)])
  assert.deepEqual(keys, ['natural', 'formal', 'casual', 'friendly'])
})

test('每种风格都有非空 label 和 hint', () => {
  for (const style of POLISH_STYLES) {
    assert.ok(style.label.length > 0, `${style.key} label 为空`)
    assert.ok(style.hint.length > 0, `${style.key} hint 为空`)
  }
})

test('polishStyleLabel 返回正确的风格标签', () => {
  assert.equal(polishStyleLabel('natural'), '简洁自然')
  assert.equal(polishStyleLabel('formal'), '正式严谨')
  assert.equal(polishStyleLabel('casual'), '口语轻松')
  assert.equal(polishStyleLabel('friendly'), '亲和友好')
})

test('polishStyleLabel 对未知键返回默认值', () => {
  assert.equal(polishStyleLabel('' as never), '简洁自然')
  assert.equal(polishStyleLabel('unknown' as never), '简洁自然')
})
