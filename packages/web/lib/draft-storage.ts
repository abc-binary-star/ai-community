import type { JSONContent } from '@tiptap/core'

export type PostStatus = 'published' | 'draft'

export interface DraftData {
  postId?: string
  title: string
  content: string
  contentDoc: JSONContent
  channel: string
  tags: string[]
  aiSummary: string
  font: string
  coverUrl: string
  status: PostStatus
}

export interface LocalDraft extends DraftData {
  id: string
  userId: string
  updatedAt: number
  createdAt: number
  serverUpdatedAt?: number
  /** 上次成功同步到服务器的内容快照 hash，用于冲突检测 */
  syncedContentHash?: string
  /** 草稿来源：'new' 新建帖；'edit' 编辑已有帖 */
  source: 'new' | 'edit'
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ConflictInfo {
  hasConflict: boolean
  localNewer: boolean
  serverNewer: boolean
  diverged: boolean
  localUpdatedAt: number
  serverUpdatedAt?: number
}

const DB_NAME = 'aicom-drafts'
const DB_VERSION = 1
const STORE_NAME = 'drafts'

function hashString(str: string): string {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function hashDraftContent(d: DraftData): string {
  const payload = [
    d.title,
    d.content,
    JSON.stringify(d.contentDoc),
    d.channel,
    d.tags.join(','),
    d.aiSummary,
    d.font,
    d.coverUrl,
  ].join('||')
  return hashString(payload)
}

export function newDraftId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function makeNewDraft(userId: string, initial?: Partial<DraftData>): LocalDraft {
  const now = Date.now()
  const base: DraftData = {
    title: '',
    content: '',
    contentDoc: { type: 'doc', content: [] },
    channel: 'general',
    tags: [],
    aiSummary: '',
    font: 'default',
    coverUrl: '',
    status: 'draft',
    ...initial,
  }
  return {
    ...base,
    id: newDraftId(),
    userId,
    updatedAt: now,
    createdAt: now,
    source: 'new',
    syncedContentHash: hashDraftContent(base),
  }
}

export function makeEditDraft(
  userId: string,
  postId: string,
  server: DraftData & { updatedAt: string },
): LocalDraft {
  const now = Date.now()
  const data: DraftData = {
    title: server.title,
    content: server.content,
    contentDoc: server.contentDoc,
    channel: server.channel,
    tags: [...server.tags],
    aiSummary: server.aiSummary,
    font: server.font,
    coverUrl: server.coverUrl,
    status: server.status,
  }
  return {
    ...data,
    id: `edit_${postId}`,
    postId,
    userId,
    updatedAt: now,
    createdAt: now,
    source: 'edit',
    serverUpdatedAt: new Date(server.updatedAt).getTime(),
    syncedContentHash: hashDraftContent(data),
  }
}

export function updateDraft(draft: LocalDraft, patch: Partial<DraftData>): LocalDraft {
  const merged: DraftData = { ...draft, ...patch }
  return { ...draft, ...merged, updatedAt: Date.now() }
}

export function draftChangedSinceSync(draft: LocalDraft): boolean {
  if (!draft.syncedContentHash) return true
  return hashDraftContent(draft) !== draft.syncedContentHash
}

export function markSynced(draft: LocalDraft, serverUpdatedAt?: number): LocalDraft {
  return {
    ...draft,
    syncedContentHash: hashDraftContent(draft),
    serverUpdatedAt: serverUpdatedAt ?? draft.serverUpdatedAt,
  }
}

export function detectConflict(
  local: LocalDraft,
  serverUpdatedAt: string | number | undefined,
): ConflictInfo {
  const serverTs = serverUpdatedAt
    ? typeof serverUpdatedAt === 'string'
      ? new Date(serverUpdatedAt).getTime()
      : serverUpdatedAt
    : undefined
  const localTs = local.updatedAt
  const knownServerTs = local.serverUpdatedAt

  if (!serverTs || !knownServerTs) {
    return {
      hasConflict: false,
      localNewer: false,
      serverNewer: false,
      diverged: false,
      localUpdatedAt: localTs,
      serverUpdatedAt: serverTs,
    }
  }

  const localChanged = draftChangedSinceSync(local)
  const serverChanged = serverTs > knownServerTs

  return {
    hasConflict: localChanged && serverChanged,
    localNewer: localChanged && !serverChanged,
    serverNewer: !localChanged && serverChanged,
    diverged: localChanged && serverChanged,
    localUpdatedAt: localTs,
    serverUpdatedAt: serverTs,
  }
}

export function formatSaveTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function openDraftsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('postId', 'postId', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDraftsDB()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)

    let resultPromise: Promise<T>
    try {
      const returned = fn(store)
      resultPromise =
        returned && typeof (returned as PromiseLike<T>).then === 'function'
          ? (returned as Promise<T>)
          : promisifyRequest(returned as IDBRequest<T>)
    } catch (e) {
      reject(e)
      return
    }

    let result: T
    let settled = false
    let txDone = false

    const tryDone = () => {
      if (settled && txDone) resolve(result)
    }

    resultPromise
      .then((r) => {
        result = r
        settled = true
        tryDone()
      })
      .catch(reject)

    tx.oncomplete = () => {
      txDone = true
      tryDone()
    }
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
}

export async function saveDraftToDB(draft: LocalDraft): Promise<void> {
  await withStore('readwrite', (store) => promisifyRequest(store.put(draft)))
}

export async function getDraftFromDB(id: string): Promise<LocalDraft | undefined> {
  return withStore('readonly', (store) => store.get(id) as IDBRequest<LocalDraft | undefined>)
}

export async function getEditDraftByPostId(
  userId: string,
  postId: string,
): Promise<LocalDraft | undefined> {
  return withStore('readonly', (store) => {
    const idx = store.index('userId')
    return promisifyRequest(idx.getAll(userId) as IDBRequest<LocalDraft[]>).then(
      (list) => (list ?? []).find((d) => d.postId === postId),
    )
  })
}

export async function listUserDrafts(userId: string): Promise<LocalDraft[]> {
  return withStore('readonly', (store) => {
    const idx = store.index('userId')
    return idx.getAll(userId) as IDBRequest<LocalDraft[]>
  })
}

export async function listUserNewDrafts(userId: string): Promise<LocalDraft[]> {
  const all = await listUserDrafts(userId)
  return all
    .filter((d) => d.source === 'new')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteDraftFromDB(id: string): Promise<void> {
  await withStore('readwrite', (store) => promisifyRequest(store.delete(id)))
}
