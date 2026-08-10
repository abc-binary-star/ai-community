'use client'

import { isAnalyticsEnabled, isErrorMonitoringEnabled } from './feature-flags'

const TRACKING_URL = process.env.NEXT_PUBLIC_TRACKING_URL
const ERROR_MONITORING_URL = process.env.NEXT_PUBLIC_ERROR_MONITORING_URL

export interface AnalyticsEvent {
  event: string
  properties: Record<string, unknown>
  timestamp: number
  url?: string
}

export interface ErrorReport {
  message: string
  stack?: string
  name: string
  component?: string
  editorType?: string
  pageType?: string
  extra?: Record<string, unknown>
  timestamp: number
  url?: string
  userAgent?: string
}

declare global {
  interface Window {
    __analyticsQueue?: AnalyticsEvent[]
    __errorReports?: ErrorReport[]
  }
}

function ensureAnalyticsQueue(): AnalyticsEvent[] {
  if (typeof window === 'undefined') return []
  if (!window.__analyticsQueue) {
    window.__analyticsQueue = []
  }
  return window.__analyticsQueue
}

function ensureErrorReports(): ErrorReport[] {
  if (typeof window === 'undefined') return []
  if (!window.__errorReports) {
    window.__errorReports = []
  }
  return window.__errorReports
}

export function getAnalyticsQueue(): AnalyticsEvent[] {
  return ensureAnalyticsQueue()
}

export function flushAnalyticsQueue(): AnalyticsEvent[] {
  if (typeof window === 'undefined') return []
  const queue = ensureAnalyticsQueue()
  const snapshot = [...queue]
  queue.length = 0
  return snapshot
}

export function track(event: string, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  if (!isAnalyticsEnabled()) return
  const payload: AnalyticsEvent = {
    event,
    properties: { ...props },
    timestamp: Date.now(),
    url: window.location.href,
  }
  const queue = ensureAnalyticsQueue()
  queue.push(payload)
  if (TRACKING_URL) {
    fetch(TRACKING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } else if (process.env.NODE_ENV !== 'production') {
    console.debug('[track]', event, props)
  }
}

export const EditorEvents = {
  EditorLoad: 'editor.load',
  EditorSwitch: 'editor.switch',
  EditorDowngrade: 'editor.downgrade',
  EditorUpgrade: 'editor.upgrade',
  PolishStart: 'editor.polish.start',
  PolishSuccess: 'editor.polish.success',
  PolishError: 'editor.polish.error',
  PolishAccept: 'editor.polish.accept',
  PolishReject: 'editor.polish.reject',
  PolishRestore: 'editor.polish.restore',
  PolishPanelOpen: 'editor.polish.panel_open',
  PolishDiscard: 'editor.polish.discard',
  PublishStart: 'editor.publish.start',
  PublishSuccess: 'editor.publish.success',
  PublishError: 'editor.publish.error',
  SaveDraftStart: 'editor.save_draft.start',
  SaveDraftSuccess: 'editor.save_draft.success',
  SaveDraftError: 'editor.save_draft.error',
  ImageUploadStart: 'editor.image_upload.start',
  ImageUploadSuccess: 'editor.image_upload.success',
  ImageUploadError: 'editor.image_upload.error',
  DocxImportStart: 'editor.docx.import.start',
  DocxImportSuccess: 'editor.docx.import.success',
  DocxImportError: 'editor.docx.import.error',
  VoiceInputStart: 'editor.voice.start',
  VoiceInputSuccess: 'editor.voice.success',
  VoiceInputError: 'editor.voice.error',
  FontChange: 'editor.font_change',
  PreviewToggle: 'editor.preview.toggle',
  EditorError: 'editor.error',
  EditorSwitchFallback: 'editor.switch.fallback',
  AutosaveConflictResolved: 'editor.autosave.conflict.resolved',
  AutosaveConflictDiverged: 'editor.autosave.conflict.diverged',
  FeatureFlagOverride: 'editor.feature_flag.override',
  RichEditorLoad: 'editor.richtext.load',
  RichEditorDowngrade: 'editor.richtext.downgrade',
} as const

export const AnalyticsEvents = {
  Editor: EditorEvents,
} as const

export type EditorEventName = (typeof EditorEvents)[keyof typeof EditorEvents]

export function trackEditor(event: EditorEventName, props: Record<string, unknown> = {}) {
  track(event, {
    editorType: props.editorType,
    pageType: props.pageType,
    ...props,
  })
}

interface ErrorPayload {
  message: string
  stack?: string
  name: string
  component?: string
  editorType?: string
  pageType?: string
  extra?: Record<string, unknown>
}

function reportErrorToServer(payload: ErrorPayload) {
  const enriched: ErrorReport = {
    ...payload,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : '',
  }
  if (typeof window !== 'undefined') {
    ensureErrorReports().push(enriched)
  }
  if (!ERROR_MONITORING_URL) return
  const body = JSON.stringify(enriched)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(ERROR_MONITORING_URL, body)
      return
    } catch {
      // fallthrough to fetch
    }
  }
  fetch(ERROR_MONITORING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

export function captureError(
  error: Error | unknown,
  context: { component?: string; editorType?: string; pageType?: string; extra?: Record<string, unknown> } = {},
) {
  if (typeof window === 'undefined') return
  if (!isErrorMonitoringEnabled()) return

  let err: Error
  if (error instanceof Error) {
    err = error
  } else {
    err = new Error(String(error))
  }

  const payload: ErrorPayload = {
    message: err.message,
    stack: err.stack,
    name: err.name,
    component: context.component,
    editorType: context.editorType,
    pageType: context.pageType,
    extra: context.extra,
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[error-monitor]', payload)
  }

  reportErrorToServer(payload)
}

export function createErrorBoundaryTracker(component: string, editorType?: string, pageType?: string) {
  return (error: Error | unknown, extra?: Record<string, unknown>) => {
    captureError(error, { component, editorType, pageType, extra })
  }
}

export function withErrorTracking<T extends (...args: any[]) => any>(
  fn: T,
  context: { component?: string; editorType?: string; pageType?: string; extra?: Record<string, unknown> },
): (...args: Parameters<T>) => ReturnType<T> {
  return (...args: Parameters<T>): ReturnType<T> => {
    try {
      const result = fn(...args)
      if (result instanceof Promise) {
        return result.catch((err) => {
          captureError(err, {
            ...context,
            extra: { ...context.extra, args: String(args) },
          })
          throw err
        }) as ReturnType<T>
      }
      return result
    } catch (err) {
      captureError(err, {
        ...context,
        extra: { ...context.extra, args: String(args) },
      })
      throw err
    }
  }
}
