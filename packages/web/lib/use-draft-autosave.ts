import { useEffect, useRef, useState, useCallback } from 'react'
import {
  type DraftData,
  type LocalDraft,
  type SaveStatus,
  type ConflictInfo,
  makeNewDraft,
  makeEditDraft,
  updateDraft,
  draftChangedSinceSync,
  detectConflict,
  saveDraftToDB,
  getDraftFromDB,
  getEditDraftByPostId,
  deleteDraftFromDB,
  markSynced,
} from './draft-storage'
import { useDebouncedCallback, useBeforeUnload } from './use-debounce-unload'

export interface UseDraftAutoSaveOptions {
  userId: string
  postId?: string
  initialServerDraft?: DraftData & { updatedAt: string }
  onDraftRestored?: (draft: LocalDraft) => void
  onConflictDetected?: (info: ConflictInfo, local: LocalDraft) => void
  debounceMs?: number
}

export interface UseDraftAutoSaveResult {
  draft: LocalDraft | null
  saveStatus: SaveStatus
  lastSavedAt: number | undefined
  lastError: string | undefined
  conflict: ConflictInfo | null
  isDirty: boolean
  setDraftData: (patch: Partial<DraftData>) => void
  flushSave: () => Promise<void>
  discardLocal: () => Promise<void>
  useLocalVersion: () => Promise<void>
  acceptServerVersion: (server: DraftData & { updatedAt: string }) => Promise<void>
  /** 暂停自动保存（发布期间调用） */
  pause: () => void
  /** 恢复自动保存 */
  resume: () => void
  /** 发布成功后清理本地草稿 */
  clearDraftAfterPublish: () => Promise<void>
}

const DEFAULT_DEBOUNCE_MS = 1500
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 30000]

export function useDraftAutoSave(opts: UseDraftAutoSaveOptions): UseDraftAutoSaveResult {
  const {
    userId,
    postId,
    initialServerDraft,
    onDraftRestored,
    onConflictDetected,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = opts

  const [draft, setDraft] = useState<LocalDraft | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>()
  const [lastError, setLastError] = useState<string | undefined>()
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)

  const draftRef = useRef<LocalDraft | null>(null)
  const serverUpdatedAtRef = useRef<number | undefined>()
  const saveInFlightRef = useRef(false)
  const pendingPatchRef = useRef<Partial<DraftData> | null>(null)
  const pausedRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onlineListenerRef = useRef(false)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (initialServerDraft) {
      serverUpdatedAtRef.current = new Date(initialServerDraft.updatedAt).getTime()
    }
  }, [initialServerDraft])

  const persistDraft = useCallback(async (next: LocalDraft) => {
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaveStatus('saving')
    setLastError(undefined)
    try {
      await saveDraftToDB(next)
      setLastSavedAt(next.updatedAt)
      setSaveStatus('saved')
      retryCountRef.current = 0
    } catch (e) {
      const msg = e instanceof Error ? e.message : '本地保存失败'
      setLastError(msg)
      setSaveStatus('error')
    } finally {
      saveInFlightRef.current = false
    }
  }, [])

  const checkAndPersist = useCallback(async () => {
    if (pausedRef.current) return
    const pending = pendingPatchRef.current
    const current = draftRef.current
    pendingPatchRef.current = null
    if (!current) return
    const next = pending ? updateDraft(current, pending) : current
    setDraft(next)
    draftRef.current = next
    await persistDraft(next)
  }, [persistDraft])

  const debouncedSave = useDebouncedCallback(() => {
    void checkAndPersist()
  }, debounceMs)

  const setDraftData = useCallback(
    (patch: Partial<DraftData>) => {
      const current = draftRef.current
      if (!current) return
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch }
      const preview = updateDraft(current, pendingPatchRef.current)
      setDraft(preview)
      draftRef.current = preview
      if (saveStatus === 'saved' || saveStatus === 'error') {
        setSaveStatus('idle')
      }
      if (!pausedRef.current) {
        debouncedSave()
      }
    },
    [debouncedSave, saveStatus],
  )

  const flushSave = useCallback(async () => {
    await checkAndPersist()
  }, [checkAndPersist])

  const isDirty = !!draft && draftChangedSinceSync(draft)

  // 14. 离线重试：监听 online 事件
  useEffect(() => {
    if (onlineListenerRef.current) return
    onlineListenerRef.current = true
    const handleOnline = () => {
      if (saveStatus === 'error' && retryCountRef.current > 0) {
        retryCountRef.current = 0
        void checkAndPersist()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      onlineListenerRef.current = false
    }
  }, [saveStatus, checkAndPersist])

  // 14. 离线重试：指数退避
  useEffect(() => {
    if (saveStatus !== 'error' || pausedRef.current) return
    if (retryTimerRef.current) return
    const delay = RETRY_DELAYS[Math.min(retryCountRef.current, RETRY_DELAYS.length - 1)]
    retryCountRef.current += 1
    setSaveStatus('retrying')
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      void checkAndPersist()
    }, delay)
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [saveStatus, checkAndPersist])

  useBeforeUnload(isDirty)

  const initDraft = useCallback(async () => {
    if (!userId) return
    let existing: LocalDraft | undefined
    if (postId) {
      existing = await getEditDraftByPostId(userId, postId)
    } else {
      const storedId = sessionStorage.getItem(`new-draft:${userId}`)
      if (storedId) existing = await getDraftFromDB(storedId)
    }

    if (existing) {
      setDraft(existing)
      draftRef.current = existing
      if (initialServerDraft) {
        const info = detectConflict(existing, initialServerDraft.updatedAt)
        setConflict(info)
        if (info.hasConflict) {
          onConflictDetected?.(info, existing)
        }
      }
      onDraftRestored?.(existing)
      return
    }

    if (postId) {
      if (!initialServerDraft) return
      const created = makeEditDraft(userId, postId, initialServerDraft)
      setDraft(created)
      draftRef.current = created
      await persistDraft(created)
    } else {
      const created = makeNewDraft(userId)
      sessionStorage.setItem(`new-draft:${userId}`, created.id)
      setDraft(created)
      draftRef.current = created
      await persistDraft(created)
    }
  }, [userId, postId, initialServerDraft, onDraftRestored, onConflictDetected, persistDraft])

  useEffect(() => {
    void initDraft()
    return () => {
      void checkAndPersist()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!initialServerDraft || !postId) return
    if (!userId) return

    const ensure = async () => {
      const current = draftRef.current
      if (!current) {
        const existing = await getEditDraftByPostId(userId, postId)
        if (existing) {
          setDraft(existing)
          draftRef.current = existing
          onDraftRestored?.(existing)
        } else {
          const created = makeEditDraft(userId, postId, initialServerDraft)
          setDraft(created)
          draftRef.current = created
          await persistDraft(created)
          return
        }
      }
      const d = draftRef.current
      if (!d) return
      const info = detectConflict(d, initialServerDraft.updatedAt)
      setConflict((prev) => (prev?.hasConflict ? prev : info))
      if (info.hasConflict) {
        onConflictDetected?.(info, d)
      }
    }
    void ensure()
  }, [initialServerDraft, postId, userId, onDraftRestored, onConflictDetected, persistDraft])

  const discardLocal = useCallback(async () => {
    const current = draftRef.current
    if (!current) return
    await deleteDraftFromDB(current.id)
    pendingPatchRef.current = null
    setConflict(null)
    let replacement: LocalDraft
    if (postId && initialServerDraft) {
      replacement = makeEditDraft(userId, postId, initialServerDraft)
    } else {
      replacement = makeNewDraft(userId)
      sessionStorage.setItem(`new-draft:${userId}`, replacement.id)
    }
    setDraft(replacement)
    draftRef.current = replacement
    await persistDraft(replacement)
  }, [userId, postId, initialServerDraft, persistDraft])

  const useLocalVersion = useCallback(async () => {
    setConflict(null)
    const current = draftRef.current
    if (current) {
      const bumped = { ...current, updatedAt: Date.now() }
      setDraft(bumped)
      draftRef.current = bumped
      await persistDraft(bumped)
    }
  }, [persistDraft])

  const acceptServerVersion = useCallback(
    async (server: DraftData & { updatedAt: string }) => {
      setConflict(null)
      if (!postId) return
      const replacement = makeEditDraft(userId, postId, server)
      setDraft(replacement)
      draftRef.current = replacement
      serverUpdatedAtRef.current = new Date(server.updatedAt).getTime()
      await persistDraft(replacement)
    },
    [userId, postId, persistDraft],
  )

  // 12. 发布锁：暂停/恢复
  const pause = useCallback(() => {
    pausedRef.current = true
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    // 恢复后如果有未保存的改动，触发一次保存
    if (pendingPatchRef.current || (draftRef.current && draftChangedSinceSync(draftRef.current))) {
      void checkAndPersist()
    }
  }, [checkAndPersist])

  // 12. 发布成功后清理本地草稿
  const clearDraftAfterPublish = useCallback(async () => {
    const current = draftRef.current
    if (current) {
      await deleteDraftFromDB(current.id)
    }
    pendingPatchRef.current = null
    pausedRef.current = false
    setSaveStatus('idle')
    setLastError(undefined)
  }, [])

  return {
    draft,
    saveStatus,
    lastSavedAt,
    lastError,
    conflict,
    isDirty,
    setDraftData,
    flushSave,
    discardLocal,
    useLocalVersion,
    acceptServerVersion,
    pause,
    resume,
    clearDraftAfterPublish,
  }
}

export function markDraftSynced(draft: LocalDraft, serverUpdatedAt?: Date): LocalDraft {
  const ts = serverUpdatedAt ? serverUpdatedAt.getTime() : undefined
  const updated = markSynced(draft, ts)
  return updated
}
