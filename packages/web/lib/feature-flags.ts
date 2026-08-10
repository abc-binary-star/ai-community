'use client'

import React from 'react'

export type EditorType = 'rich-text' | 'markdown'

const FF_PREFIX = 'ff_'

export interface EditorFeatureFlags {
  richTextEnabled: boolean
  contentDocSyncEnabled: boolean
  editorDowngradeAllowed: boolean
  defaultEditor: EditorType
  errorMonitoringEnabled: boolean
  analyticsEnabled: boolean
  autoSaveEnabled: boolean
  aiDiffReviewEnabled: boolean
  bubbleMenuEnabled: boolean
  slashMenuEnabled: boolean
  outlineViewEnabled: boolean
}

const DEFAULT_FLAGS: EditorFeatureFlags = {
  richTextEnabled: true,
  contentDocSyncEnabled: true,
  editorDowngradeAllowed: true,
  defaultEditor: 'rich-text',
  errorMonitoringEnabled: true,
  analyticsEnabled: true,
  autoSaveEnabled: true,
  aiDiffReviewEnabled: true,
  bubbleMenuEnabled: true,
  slashMenuEnabled: true,
  outlineViewEnabled: true,
}

function parseBool(env: string | undefined, defaultValue: boolean): boolean {
  if (env === undefined) return defaultValue
  return env !== 'false' && env !== '0'
}

function parseEditorType(env: string | undefined, defaultValue: EditorType): EditorType {
  if (env === 'markdown' || env === 'rich-text') return env
  return defaultValue
}

function readEnvFlags(): Partial<EditorFeatureFlags> {
  return {
    richTextEnabled: parseBool(process.env.NEXT_PUBLIC_RICH_TEXT_ENABLED, DEFAULT_FLAGS.richTextEnabled),
    contentDocSyncEnabled: parseBool(process.env.NEXT_PUBLIC_CONTENT_DOC_SYNC_ENABLED, DEFAULT_FLAGS.contentDocSyncEnabled),
    editorDowngradeAllowed: parseBool(process.env.NEXT_PUBLIC_EDITOR_DOWNGRADE_ALLOWED, DEFAULT_FLAGS.editorDowngradeAllowed),
    defaultEditor: parseEditorType(process.env.NEXT_PUBLIC_DEFAULT_EDITOR, DEFAULT_FLAGS.defaultEditor),
    errorMonitoringEnabled: parseBool(process.env.NEXT_PUBLIC_ERROR_MONITORING_ENABLED, DEFAULT_FLAGS.errorMonitoringEnabled),
    analyticsEnabled: parseBool(process.env.NEXT_PUBLIC_ANALYTICS_ENABLED, DEFAULT_FLAGS.analyticsEnabled),
    autoSaveEnabled: parseBool(process.env.NEXT_PUBLIC_AUTOSAVE_ENABLED, DEFAULT_FLAGS.autoSaveEnabled),
    aiDiffReviewEnabled: parseBool(process.env.NEXT_PUBLIC_AI_DIFF_REVIEW_ENABLED, DEFAULT_FLAGS.aiDiffReviewEnabled),
    bubbleMenuEnabled: parseBool(process.env.NEXT_PUBLIC_BUBBLE_MENU_ENABLED, DEFAULT_FLAGS.bubbleMenuEnabled),
    slashMenuEnabled: parseBool(process.env.NEXT_PUBLIC_SLASH_MENU_ENABLED, DEFAULT_FLAGS.slashMenuEnabled),
    outlineViewEnabled: parseBool(process.env.NEXT_PUBLIC_OUTLINE_VIEW_ENABLED, DEFAULT_FLAGS.outlineViewEnabled),
  }
}

export function isAnnotationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANNOTATIONS_ENABLED !== 'false'
}

export function getEditorFeatureFlags(): EditorFeatureFlags {
  const envFlags = readEnvFlags()
  const flags: EditorFeatureFlags = { ...DEFAULT_FLAGS, ...envFlags }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`${FF_PREFIX}editor_flags`)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<EditorFeatureFlags>
        Object.assign(flags, parsed)
      }
    } catch {
      // ignore
    }
  }

  return flags
}

export function isRichTextEditorEnabled(): boolean {
  return getEditorFeatureFlags().richTextEnabled
}

export function isContentDocSyncEnabled(): boolean {
  return getEditorFeatureFlags().contentDocSyncEnabled
}

export function isEditorDowngradeAllowed(): boolean {
  return getEditorFeatureFlags().editorDowngradeAllowed
}

export function getDefaultEditor(): EditorType {
  return getEditorFeatureFlags().defaultEditor
}

export function isErrorMonitoringEnabled(): boolean {
  return getEditorFeatureFlags().errorMonitoringEnabled
}

export function isAnalyticsEnabled(): boolean {
  return getEditorFeatureFlags().analyticsEnabled
}

export function isAutoSaveEnabled(): boolean {
  return getEditorFeatureFlags().autoSaveEnabled
}

export function isAiDiffReviewEnabled(): boolean {
  return getEditorFeatureFlags().aiDiffReviewEnabled
}

export function isBubbleMenuEnabled(): boolean {
  return getEditorFeatureFlags().bubbleMenuEnabled
}

export function isSlashMenuEnabled(): boolean {
  return getEditorFeatureFlags().slashMenuEnabled
}

export function isOutlineViewEnabled(): boolean {
  return getEditorFeatureFlags().outlineViewEnabled
}

export function overrideEditorFlags(overrides: Partial<EditorFeatureFlags>): void {
  if (typeof window === 'undefined') return
  try {
    const current = getEditorFeatureFlags()
    const merged = { ...current, ...overrides }
    localStorage.setItem(`${FF_PREFIX}editor_flags`, JSON.stringify(merged))
    window.dispatchEvent(new CustomEvent('editor-flags-changed', { detail: merged }))
  } catch {
    // ignore
  }
}

export function resetEditorFlags(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${FF_PREFIX}editor_flags`)
    window.dispatchEvent(new CustomEvent('editor-flags-changed', { detail: getEditorFeatureFlags() }))
  } catch {
    // ignore
  }
}

export function useEditorFlags(): EditorFeatureFlags {
  const [flags, setFlags] = React.useState<EditorFeatureFlags>(() => getEditorFeatureFlags())

  React.useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<EditorFeatureFlags>
      setFlags(custom.detail)
    }
    window.addEventListener('editor-flags-changed', handler as EventListener)
    window.addEventListener('storage', handler as EventListener)
    return () => {
      window.removeEventListener('editor-flags-changed', handler as EventListener)
      window.removeEventListener('storage', handler as EventListener)
    }
  }, [])

  return flags
}
