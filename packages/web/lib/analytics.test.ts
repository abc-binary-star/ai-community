import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import {
  AnalyticsEvents,
  captureError,
  EditorEvents,
  flushAnalyticsQueue,
  getAnalyticsQueue,
  track,
  trackEditor,
} from './analytics'

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.__analyticsQueue = []
    window.__errorReports = []
  }
})

afterEach(() => {
  if (typeof window !== 'undefined') {
    window.__analyticsQueue = []
    window.__errorReports = []
  }
})

test('EditorEvents 包含关键编辑器事件常量', () => {
  assert.equal(EditorEvents.EditorLoad, 'editor.load')
  assert.equal(EditorEvents.EditorSwitch, 'editor.switch')
  assert.equal(EditorEvents.EditorDowngrade, 'editor.downgrade')
  assert.equal(EditorEvents.EditorUpgrade, 'editor.upgrade')
  assert.equal(EditorEvents.PublishStart, 'editor.publish.start')
  assert.equal(EditorEvents.PublishSuccess, 'editor.publish.success')
  assert.equal(EditorEvents.PublishError, 'editor.publish.error')
  assert.equal(EditorEvents.SaveDraftStart, 'editor.save_draft.start')
  assert.equal(EditorEvents.SaveDraftSuccess, 'editor.save_draft.success')
  assert.equal(EditorEvents.SaveDraftError, 'editor.save_draft.error')
  assert.equal(EditorEvents.ImageUploadStart, 'editor.image_upload.start')
  assert.equal(EditorEvents.ImageUploadSuccess, 'editor.image_upload.success')
  assert.equal(EditorEvents.ImageUploadError, 'editor.image_upload.error')
  assert.equal(EditorEvents.FontChange, 'editor.font_change')
  assert.equal(EditorEvents.EditorError, 'editor.error')
})

test('AnalyticsEvents 与 EditorEvents 分别导出', () => {
  assert.equal(typeof AnalyticsEvents, 'object')
  assert.equal(AnalyticsEvents.Editor, EditorEvents)
})

test('SSR 环境下 trackEditor 不会抛错', () => {
  if (typeof window !== 'undefined') {
    return
  }
  let threw = false
  try {
    trackEditor(EditorEvents.EditorLoad, { editorType: 'markdown', pageType: 'new-post' })
  } catch {
    threw = true
  }
  assert.equal(threw, false, 'SSR 环境 trackEditor 不应抛出异常')
})

test('SSR 环境下 captureError 不会抛错', () => {
  if (typeof window !== 'undefined') {
    return
  }
  let threw = false
  try {
    captureError(new Error('boom'), { component: 'test' })
  } catch {
    threw = true
  }
  assert.equal(threw, false, 'SSR 环境 captureError 不应抛出异常')
})

test('trackEditor 写入事件队列（浏览器环境）', () => {
  if (typeof window === 'undefined') {
    return
  }
  trackEditor(EditorEvents.EditorSwitch, {
    editorType: 'rich-text',
    targetEditor: 'markdown',
    pageType: 'new-post',
  })
  const queue = getAnalyticsQueue()
  assert.ok(Array.isArray(queue))
  assert.ok(queue.length >= 1, '应该至少有一条事件')
  const last = queue[queue.length - 1]
  assert.equal(last.event, 'editor.switch')
  assert.ok(typeof last.timestamp === 'number')
  assert.equal(last.properties.editorType, 'rich-text')
  assert.equal(last.properties.targetEditor, 'markdown')
  assert.equal(last.properties.pageType, 'new-post')
})

test('track 通用埋点写入队列（浏览器环境）', () => {
  if (typeof window === 'undefined') {
    return
  }
  track('custom.button.click', { label: 'ok' })
  const queue = getAnalyticsQueue()
  const last = queue[queue.length - 1]
  assert.equal(last.event, 'custom.button.click')
  assert.equal(last.properties.label, 'ok')
})

test('captureError 写入错误报告队列（浏览器环境）', () => {
  if (typeof window === 'undefined') {
    return
  }
  const errReports = window.__errorReports ?? []
  const original = errReports.length
  const err = new Error('test capture')
  captureError(err, {
    component: 'EditorX',
    editorType: 'rich-text',
    pageType: 'new-post',
    extra: { reason: 'demo' },
  })
  assert.ok(window.__errorReports)
  assert.equal(window.__errorReports!.length, original + 1)
  const report = window.__errorReports![window.__errorReports!.length - 1]
  assert.equal(report.message, 'test capture')
  assert.equal(report.component, 'EditorX')
  assert.equal(report.editorType, 'rich-text')
  assert.equal(report.pageType, 'new-post')
  assert.equal(report.extra?.reason, 'demo')
})

test('captureError 对非 Error 实例包装为 Error（浏览器环境）', () => {
  if (typeof window === 'undefined') {
    return
  }
  captureError('a string error', { component: 'StrComp' })
  assert.ok(window.__errorReports)
  const list = window.__errorReports!
  const report = list[list.length - 1]
  assert.equal(report.message, 'a string error')
  assert.equal(report.name, 'Error')
  assert.equal(report.component, 'StrComp')
})

test('flushAnalyticsQueue 清空并返回队列内容（浏览器环境）', () => {
  if (typeof window === 'undefined') {
    return
  }
  trackEditor(EditorEvents.EditorLoad, { editorType: 'markdown', pageType: 'test' })
  const before = getAnalyticsQueue().length
  assert.ok(before >= 1)
  const flushed = flushAnalyticsQueue()
  assert.ok(Array.isArray(flushed))
  assert.ok(flushed.length >= 1)
  assert.equal(getAnalyticsQueue().length, 0)
})

test('埋点属性 editorType 可为 rich-text 或 markdown', () => {
  if (typeof window === 'undefined') {
    return
  }
  trackEditor(EditorEvents.PublishStart, { editorType: 'rich-text', pageType: 'new-post' })
  trackEditor(EditorEvents.PublishStart, { editorType: 'markdown', pageType: 'edit-post', postId: 'abc' })
  const queue = getAnalyticsQueue()
  const first = queue[queue.length - 2]
  const second = queue[queue.length - 1]
  assert.equal(first.properties.editorType, 'rich-text')
  assert.equal(second.properties.editorType, 'markdown')
  assert.equal(second.properties.postId, 'abc')
})

test('埋点事件错误场景上报包含 error 字段', () => {
  if (typeof window === 'undefined') {
    return
  }
  trackEditor(EditorEvents.PublishError, {
    editorType: 'markdown',
    pageType: 'new-post',
    error: 'network error',
  })
  const queue = getAnalyticsQueue()
  const last = queue[queue.length - 1]
  assert.equal(last.event, EditorEvents.PublishError)
  assert.equal(last.properties.error, 'network error')
})
