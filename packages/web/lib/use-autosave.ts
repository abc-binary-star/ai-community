'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
  accumulatePatch,
  computeIsDirty,
  concludeSave,
  createAutosaveAccumulator,
  flushAccumulated,
  planConflictResolution,
  transitionSaveStatus,
  type ConflictResolutionChoice,
  type SaveStatus,
} from './autosave-logic'
import {
  deleteDraftFromDB,
  detectConflict,
  formatSaveTime,
  getEditDraftByPostId,
  listUserNewDrafts,
  makeEditDraft,
  makeNewDraft,
  markSynced,
  saveDraftToDB,
  updateDraft,
  type DraftData,
  type LocalDraft,
  type PostStatus,
} from './draft-storage'
import { captureError, track, EditorEvents } from './analytics'

export type EditorPageKind = 'new' | 'edit'

// 从 draft-storage 重新导出 DraftData，避免文件内自循环定义
export type { DraftData, LocalDraft, PostStatus }

export interface UseAutosaveOptions {
  userId: string
  page: EditorPageKind
  postId?: string
  /** 服务器已知的最新帖子 updatedAt（仅 edit 页） */
  serverPostUpdatedAt?: string
  /** 保存节流 ms（默认 1200） */
  debounceMs?: number
  /** 强制关闭自动保存 */
  disabled?: boolean
  /** 编辑器选择 */
  editorType: 'markdown' | 'rich-text'
}

export interface AutosaveState {
  saveStatus: SaveStatus
  lastSavedAt: number | null
  draft: LocalDraft | null
  isDirty: boolean
  /** 草稿来源：本地有 vs 空的全新编辑页 */
  loaded: boolean
  /** 服务器更新时间大于本地的冲突提示 */
  conflictMessage: string | null
  /** 冲突决策弹窗 */
  conflictDecision: null | {
    localUpdatedAt: number
    serverUpdatedAt: number
    onChoice: (choice: ConflictResolutionChoice) => void
  }
}

export interface AutosaveApi {
  state: AutosaveState
  patch: (p: Partial<DraftData>) => void
  /** 初始化一次草稿（服务端拉到帖子后），恢复本地草稿或基于服务器内容创建一个空编辑草稿 */
  initialize: (serverData: DraftData & { updatedAt?: string }) => Promise<void>
  /** 新建帖首次加载：恢复本地最新新草稿或创建一个新草稿 */
  initializeNew: (preferredChannel?: string) => Promise<void>
  /** 显式写一次 DB */
  forceSave: () => Promise<void>
  /** 发布/保存成功时：删除本地草稿或把 serverUpdatedAt 推进 */
  markServerSynced: (serverUpdatedAt?: string) => Promise<void>
  /** 丢弃本次草稿（比如用户点击“放弃”） */
  discardLocalDraft: () => Promise<void>
  /** 草稿 → 页面表单回填字段（草稿字段始终是最终真值） */
  snapshot: DraftData | null
}

function editorTypeFromDraft(d: DraftData | undefined): 'markdown' | 'rich-text' {
  if (!d) return 'markdown'
  if (d.contentDoc && (d.contentDoc.content?.length ?? 0) > 0) return 'rich-text'
  return 'markdown'
}

export function useAutosave(opts: UseAutosaveOptions): AutosaveApi {
  const { userId, page, postId, serverPostUpdatedAt, debounceMs = 1200, disabled, editorType } = opts

  const [draft, setDraft] = useState<LocalDraft | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [conflictDecision, setConflictDecision] = useState<AutosaveState['conflictDecision']>(null)

  const accRef = useRef(createAutosaveAccumulator())
  const draftRef = useRef(draft)
  const flushTimerRef = useRef<number | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => { draftRef.current = draft }, [draft])

  const pendingPatch = accRef.current.pendingPatch
  const isDirty = useMemo(
    () => computeIsDirty({ draft, pendingPatch }),
    [draft, pendingPatch],
  )

  const performSave = useCallback(async () => {
    if (disabled) return
    const acc = accRef.current
    const now = Date.now()
    const current = draftRef.current
    const { shouldSave, nextDraft, newAcc } = flushAccumulated(acc, current, now)
    if (!shouldSave || !nextDraft) {
      // 即使没变更，也把状态往前推进
      accRef.current = newAcc
      return
    }
    accRef.current = newAcc
    setSaveStatus((s: SaveStatus) => transitionSaveStatus(s, 'start_save'))
    try {
      await saveDraftToDB(nextDraft)
      draftRef.current = nextDraft
      setDraft(nextDraft)
      setLastSavedAt(nextDraft.updatedAt)
      setSaveStatus((s: SaveStatus) => transitionSaveStatus(s, 'save_success'))
    } catch (e) {
      captureError(e, {
        component: 'useAutosave.performSave',
        extra: { page, postId, userId },
      })
      track(EditorEvents.SaveDraftError, {
        pageType: page,
        postId,
        error: e instanceof Error ? e.message : String(e),
      })
      setSaveStatus((s: SaveStatus) => transitionSaveStatus(s, 'save_error'))
    } finally {
      accRef.current = concludeSave(accRef.current)
    }
  }, [disabled, page, postId, userId])

  // 防抖调度
  const scheduleFlush = useCallback(() => {
    if (disabled) return
    setSaveStatus((s: SaveStatus) => transitionSaveStatus(s, 'edit'))
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      void performSave()
    }, debounceMs)
  }, [debounceMs, disabled, performSave])

  const patch = useCallback((p: Partial<DraftData>) => {
    if (disabled || !draftRef.current) return
    // 只保存与当前 editor 匹配的主体字段，避免空的 markdown 覆盖富文本或反之
    const safePatch: Partial<DraftData> = { ...p }
    if (editorType === 'rich-text' && p.content !== undefined) {
      // 富文本模式：若调用方误传了 content，允许；但如果没有 contentDoc，就用空 doc
      if (p.contentDoc === undefined) {
        // no-op: trust the caller
      }
    }
    accRef.current = accumulatePatch(accRef.current, safePatch)
    scheduleFlush()
  }, [disabled, editorType, scheduleFlush])

  const forceSave = useCallback(async () => {
    if (disabled) return
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    await performSave()
  }, [disabled, performSave])

  const detectAndPlanConflict = useCallback((local: LocalDraft, serverTs?: number) => {
    const info = detectConflict(local, serverTs)
    if (info.hasConflict) {
      track(EditorEvents.AutosaveConflictDiverged, {
        pageType: page,
        postId,
        localUpdatedAt: info.localUpdatedAt,
        serverUpdatedAt: info.serverUpdatedAt,
      })
    } else if (info.serverNewer || info.localNewer) {
      track(EditorEvents.AutosaveConflictResolved, {
        pageType: page,
        postId,
        resolution: info.localNewer ? 'use-local' : 'accept-server',
      })
    }
    return info
  }, [page, postId])

  const initialize = useCallback(async (serverData: DraftData & { updatedAt?: string }) => {
    if (page !== 'edit' || !postId) return
    if (initializedRef.current) return
    initializedRef.current = true
    try {
      const local = await getEditDraftByPostId(userId, postId)
      const serverTs = serverData.updatedAt ? new Date(serverData.updatedAt).getTime() : undefined
      if (local) {
        const info = detectAndPlanConflict(local, serverTs)
        if (info.diverged) {
          setConflictDecision({
            localUpdatedAt: info.localUpdatedAt,
            serverUpdatedAt: info.serverUpdatedAt ?? serverTs ?? Date.now(),
            onChoice: (choice) => {
              const plan = planConflictResolution(
                info.hasConflict,
                info.localNewer,
                info.serverNewer,
                info.diverged,
                choice,
              )
              if (plan.choice === 'accept-server' || plan.choice === 'discard-local') {
                const fresh = makeEditDraft(userId, postId, { ...serverData, updatedAt: serverData.updatedAt ?? new Date().toISOString() })
                setDraft(fresh)
                draftRef.current = fresh
                if (plan.shouldDeleteOldDraft) void deleteDraftFromDB(local.id)
              } else {
                setDraft(local)
                draftRef.current = local
                setConflictMessage('检测到服务器已有更新，但已选择保留本地草稿，请核对后再发布')
              }
              setConflictDecision(null)
            },
          })
          setDraft(local)
          draftRef.current = local
          return
        }
        const plan = planConflictResolution(info.hasConflict, info.localNewer, info.serverNewer, info.diverged)
        if (plan.choice === 'accept-server') {
          const fresh = makeEditDraft(userId, postId, { ...serverData, updatedAt: serverData.updatedAt ?? new Date().toISOString() })
          setDraft(fresh)
          draftRef.current = fresh
          void deleteDraftFromDB(local.id)
        } else {
          setDraft(local)
          draftRef.current = local
        }
        return
      }
      const fresh = makeEditDraft(userId, postId, { ...serverData, updatedAt: serverData.updatedAt ?? new Date().toISOString() })
      setDraft(fresh)
      draftRef.current = fresh
      void saveDraftToDB(fresh)
    } catch (e) {
      captureError(e, { component: 'useAutosave.initialize', extra: { page, postId, userId } })
      const fallback = makeEditDraft(userId, postId, { ...serverData, updatedAt: serverData.updatedAt ?? new Date().toISOString() })
      setDraft(fallback)
      draftRef.current = fallback
    } finally {
      setLoaded(true)
    }
  }, [detectAndPlanConflict, page, postId, userId])

  const initializeNew = useCallback(async (preferredChannel?: string) => {
    if (page !== 'new') return
    if (initializedRef.current) return
    initializedRef.current = true
    try {
      // 新建帖：尝试恢复最新的 source=new 草稿（用户可能刷新了页面）
      const all = await listUserNewDrafts(userId)
      if (all.length > 0) {
        const latest = all[0]
        setDraft(latest)
        draftRef.current = latest
        if (preferredChannel && !latest.channel) {
          patch({ channel: preferredChannel })
        }
        setConflictMessage('已恢复上次未发布的草稿')
        track(EditorEvents.SaveDraftSuccess, { pageType: 'new', restored: true })
        return
      }
      const base: Partial<DraftData> = {}
      if (preferredChannel) base.channel = preferredChannel
      const nd = makeNewDraft(userId, base)
      setDraft(nd)
      draftRef.current = nd
      await saveDraftToDB(nd)
    } catch (e) {
      captureError(e, { component: 'useAutosave.initializeNew', extra: { userId } })
      const nd = makeNewDraft(userId, preferredChannel ? { channel: preferredChannel } : undefined)
      setDraft(nd)
      draftRef.current = nd
    } finally {
      setLoaded(true)
    }
  }, [page, patch, userId])

  const markServerSynced = useCallback(async (serverUpdatedAt?: string) => {
    if (!draftRef.current) return
    const current = draftRef.current
    const serverTs = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : undefined
    const merged = markSynced(current, serverTs)
    // 如果是新帖发布成功：删除本地草稿，避免与已发布的 edit 记录冲突
    if (page === 'new') {
      try {
        await deleteDraftFromDB(current.id)
      } catch (e) {
        captureError(e, { component: 'useAutosave.markServerSynced.delete', extra: { page, postId } })
      }
      // 重新以 edit 方式建立一份草稿，供后续编辑使用
      if (postId && serverUpdatedAt) {
        const snapshot = snapshotFromDraft(merged)
        if (snapshot) {
          const ed = makeEditDraft(userId, postId, { ...snapshot, updatedAt: serverUpdatedAt })
          setDraft(ed)
          draftRef.current = ed
          await saveDraftToDB(ed)
        }
      } else {
        setDraft(null)
        draftRef.current = null
      }
      return
    }
    setDraft(merged)
    draftRef.current = merged
    try {
      await saveDraftToDB(merged)
    } catch (e) {
      captureError(e, { component: 'useAutosave.markServerSynced.save', extra: { page, postId } })
    }
  }, [page, postId, userId])

  const discardLocalDraft = useCallback(async () => {
    const current = draftRef.current
    if (current) {
      try {
        await deleteDraftFromDB(current.id)
      } catch (e) {
        captureError(e, { component: 'useAutosave.discardLocalDraft', extra: { page, postId } })
      }
    }
    setDraft(null)
    draftRef.current = null
    accRef.current = createAutosaveAccumulator()
  }, [page, postId])

  // 页面卸载前尝试落盘
  useEffect(() => {
    const onBeforeUnload = () => {
      if (accRef.current.pendingPatch && draftRef.current) {
        const merged = updateDraft(draftRef.current, accRef.current.pendingPatch)
        try {
          // 同步写入尝试（丢弃结果），beforeunload 下异步很可能被取消
          void saveDraftToDB(merged)
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
    }
  }, [])

  // 初始化入口（根据 page 类型分别处理）：页面实际调用 initialize / initializeNew
  // 这里只是在 serverPostUpdatedAt 变化时，重新校验一次冲突（例如发布成功后后端返回新时间戳）
  useEffect(() => {
    if (page !== 'edit' || !postId) return
    const current = draftRef.current
    if (!current || !serverPostUpdatedAt) return
    const info = detectConflict(current, serverPostUpdatedAt)
    if (info.serverNewer) {
      setConflictMessage('服务器内容已更新，即将采用服务器最新版本')
    }
  }, [page, postId, serverPostUpdatedAt])

  const snapshot: DraftData | null = draft
    ? {
        title: draft.title,
        content: draft.content,
        contentDoc: draft.contentDoc,
        channel: draft.channel,
        tags: [...draft.tags],
        aiSummary: draft.aiSummary,
        font: draft.font,
        coverUrl: draft.coverUrl,
        status: draft.status,
        postId: draft.postId,
      }
    : null

  void editorTypeFromDraft

  return {
    state: {
      saveStatus,
      lastSavedAt,
      draft,
      isDirty,
      loaded,
      conflictMessage,
      conflictDecision,
    },
    patch,
    initialize,
    initializeNew,
    forceSave,
    markServerSynced,
    discardLocalDraft,
    snapshot,
  }
}

// 小工具：LocalDraft 回退到 DraftData（去掉本地专用字段），供 markServerSynced 新建 edit draft 时复用
function snapshotFromDraft(d: LocalDraft): DraftData & { postId?: string } {
  return {
    title: d.title,
    content: d.content,
    contentDoc: d.contentDoc,
    channel: d.channel,
    tags: [...d.tags],
    aiSummary: d.aiSummary,
    font: d.font,
    coverUrl: d.coverUrl,
    status: d.status,
    postId: d.postId,
  }
}

export { formatSaveTime }
