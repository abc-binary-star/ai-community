import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import {
  getDefaultEditor,
  getEditorFeatureFlags,
  isAnalyticsEnabled,
  isContentDocSyncEnabled,
  isEditorDowngradeAllowed,
  isErrorMonitoringEnabled,
  isRichTextEditorEnabled,
  overrideEditorFlags,
  resetEditorFlags,
  type EditorType,
} from './feature-flags'

const FF_PREFIX = 'ff_'

function clearFlagStorage() {
  if (typeof localStorage === 'undefined') return
  Object.keys(localStorage).filter((k) => k.startsWith(FF_PREFIX)).forEach((k) => localStorage.removeItem(k))
}

beforeEach(() => {
  clearFlagStorage()
  resetEditorFlags()
})

afterEach(() => {
  clearFlagStorage()
  resetEditorFlags()
})

test('默认 Feature Flag 值在 SSR 环境下可用', () => {
  const flags = getEditorFeatureFlags()
  assert.equal(typeof flags.richTextEnabled, 'boolean')
  assert.equal(typeof flags.contentDocSyncEnabled, 'boolean')
  assert.equal(typeof flags.editorDowngradeAllowed, 'boolean')
  assert.equal(typeof flags.defaultEditor, 'string')
  assert.equal(typeof flags.errorMonitoringEnabled, 'boolean')
  assert.equal(typeof flags.analyticsEnabled, 'boolean')
  assert.ok(flags.defaultEditor === 'rich-text' || flags.defaultEditor === 'markdown')
})

test('isRichTextEditorEnabled/isEditorDowngradeAllowed 等快捷函数返回布尔值', () => {
  assert.equal(typeof isRichTextEditorEnabled(), 'boolean')
  assert.equal(typeof isEditorDowngradeAllowed(), 'boolean')
  assert.equal(typeof isContentDocSyncEnabled(), 'boolean')
  assert.equal(typeof isErrorMonitoringEnabled(), 'boolean')
  assert.equal(typeof isAnalyticsEnabled(), 'boolean')
  const def = getDefaultEditor()
  assert.ok(def === 'rich-text' || def === 'markdown')
})

test('overrideEditorFlags 覆盖并持久化 editor flags 到 localStorage', () => {
  if (typeof localStorage === 'undefined') {
    return
  }
  overrideEditorFlags({
    richTextEnabled: false,
    contentDocSyncEnabled: false,
    editorDowngradeAllowed: true,
    defaultEditor: 'markdown' as EditorType,
    errorMonitoringEnabled: false,
    analyticsEnabled: false,
  })
  const stored = localStorage.getItem(`${FF_PREFIX}editor_flags`)
  assert.ok(stored, 'overrideEditorFlags 应该写入 localStorage')
  const parsed = JSON.parse(stored!)
  assert.equal(parsed.richTextEnabled, false)
  assert.equal(parsed.contentDocSyncEnabled, false)
  assert.equal(parsed.editorDowngradeAllowed, true)
  assert.equal(parsed.defaultEditor, 'markdown')
  assert.equal(parsed.errorMonitoringEnabled, false)
  assert.equal(parsed.analyticsEnabled, false)
  const flags = getEditorFeatureFlags()
  assert.equal(flags.richTextEnabled, false)
  assert.equal(flags.contentDocSyncEnabled, false)
  assert.equal(flags.editorDowngradeAllowed, true)
  assert.equal(flags.defaultEditor, 'markdown')
  assert.equal(isRichTextEditorEnabled(), false)
  assert.equal(isEditorDowngradeAllowed(), true)
  assert.equal(isContentDocSyncEnabled(), false)
})

test('overrideEditorFlags 支持局部覆盖', () => {
  if (typeof localStorage === 'undefined') {
    return
  }
  const original = getEditorFeatureFlags()
  overrideEditorFlags({ analyticsEnabled: false })
  const flags = getEditorFeatureFlags()
  assert.equal(flags.analyticsEnabled, false)
  assert.equal(flags.richTextEnabled, original.richTextEnabled)
  assert.equal(flags.defaultEditor, original.defaultEditor)
})

test('resetEditorFlags 清除持久化覆盖', () => {
  if (typeof localStorage === 'undefined') {
    return
  }
  overrideEditorFlags({ defaultEditor: 'markdown' as EditorType })
  assert.equal(getDefaultEditor(), 'markdown')
  resetEditorFlags()
  assert.equal(localStorage.getItem(`${FF_PREFIX}editor_flags`), null)
  const after = getEditorFeatureFlags()
  assert.equal(typeof after.defaultEditor, 'string')
})

test('getEditorFeatureFlags 忽略 localStorage 非法 JSON', () => {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(`${FF_PREFIX}editor_flags`, '{not valid json')
  const flags = getEditorFeatureFlags()
  assert.equal(typeof flags.richTextEnabled, 'boolean')
  assert.equal(typeof flags.defaultEditor, 'string')
})

test('EditorType 合法值校验', () => {
  const valid: EditorType = 'markdown'
  assert.equal(valid, 'markdown')
  const alsoValid: EditorType = 'rich-text'
  assert.equal(alsoValid, 'rich-text')
})

test('contentDocSyncEnabled 关闭时，快捷函数应反映关闭状态', () => {
  if (typeof localStorage === 'undefined') {
    return
  }
  overrideEditorFlags({ contentDocSyncEnabled: false })
  assert.equal(isContentDocSyncEnabled(), false)
})

test('richText 关闭时，defaultEditor 应回退到 markdown（通过外部 API 设置后一致）', () => {
  if (typeof localStorage === 'undefined') {
    return
  }
  overrideEditorFlags({ richTextEnabled: false, defaultEditor: 'rich-text' as EditorType })
  const flags = getEditorFeatureFlags()
  assert.equal(flags.richTextEnabled, false)
  assert.equal(isRichTextEditorEnabled(), false)
})
