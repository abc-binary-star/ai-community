import {
  draftChangedSinceSync,
  updateDraft,
  type DraftData,
  type LocalDraft,
  type SaveStatus,
} from './draft-storage'

export type { SaveStatus, DraftData, LocalDraft }

export interface AutosaveAccumulator {
  pendingPatch: Partial<DraftData> | null
  lastFlownAt: number
  saveInFlight: boolean
}

export function createAutosaveAccumulator(): AutosaveAccumulator {
  return {
    pendingPatch: null,
    lastFlownAt: 0,
    saveInFlight: false,
  }
}

export function accumulatePatch(
  acc: AutosaveAccumulator,
  patch: Partial<DraftData>,
): AutosaveAccumulator {
  const merged: Partial<DraftData> = { ...acc.pendingPatch, ...patch }
  const hasRealChange = Object.keys(merged).length > 0
  return {
    ...acc,
    pendingPatch: hasRealChange ? merged : null,
  }
}

export interface FlushResult {
  shouldSave: boolean
  nextDraft: LocalDraft | null
  newAcc: AutosaveAccumulator
}

export function flushAccumulated(
  acc: AutosaveAccumulator,
  currentDraft: LocalDraft | null,
  nowTs: number,
): FlushResult {
  if (!currentDraft) {
    return {
      shouldSave: false,
      nextDraft: null,
      newAcc: { ...acc, pendingPatch: null },
    }
  }
  if (acc.saveInFlight) {
    return {
      shouldSave: false,
      nextDraft: null,
      newAcc: acc,
    }
  }
  const pending = acc.pendingPatch
  const nextDraft = pending ? updateDraft(currentDraft, pending) : currentDraft
  return {
    shouldSave: true,
    nextDraft,
    newAcc: {
      pendingPatch: null,
      lastFlownAt: nowTs,
      saveInFlight: true,
    },
  }
}

export function concludeSave(acc: AutosaveAccumulator): AutosaveAccumulator {
  return { ...acc, saveInFlight: false }
}

export type SaveStatusTransitionEvent =
  | 'edit'
  | 'start_save'
  | 'save_success'
  | 'save_error'
  | 'ack_error'

export function transitionSaveStatus(
  current: SaveStatus,
  event: SaveStatusTransitionEvent,
): SaveStatus {
  switch (current) {
    case 'idle':
      if (event === 'edit') return 'idle'
      if (event === 'start_save') return 'saving'
      return current
    case 'saving':
      if (event === 'edit') return 'saving'
      if (event === 'save_success') return 'saved'
      if (event === 'save_error') return 'error'
      return current
    case 'saved':
      if (event === 'edit') return 'idle'
      if (event === 'start_save') return 'saving'
      return current
    case 'error':
      if (event === 'edit') return 'idle'
      if (event === 'start_save') return 'saving'
      if (event === 'ack_error') return 'idle'
      return current
    default:
      return current
  }
}

export interface DirtyDecisionInput {
  draft: LocalDraft | null
  pendingPatch: Partial<DraftData> | null
}

export function computeIsDirty(input: DirtyDecisionInput): boolean {
  const { draft, pendingPatch } = input
  if (!draft) return false
  if (pendingPatch && Object.keys(pendingPatch).length > 0) return true
  return draftChangedSinceSync(draft)
}

export type ConflictResolutionChoice = 'use-local' | 'accept-server' | 'discard-local'

export interface ConflictResolutionPlan {
  choice: ConflictResolutionChoice
  shouldDeleteOldDraft: boolean
  shouldNotifyUser: boolean
  nextServerUpdatedAt?: number
}

export function planConflictResolution(
  hasConflict: boolean,
  localNewer: boolean,
  serverNewer: boolean,
  diverged: boolean,
  userChoice?: ConflictResolutionChoice,
): ConflictResolutionPlan {
  if (!hasConflict) {
    if (localNewer) {
      return {
        choice: 'use-local',
        shouldDeleteOldDraft: false,
        shouldNotifyUser: false,
      }
    }
    if (serverNewer) {
      return {
        choice: 'accept-server',
        shouldDeleteOldDraft: true,
        shouldNotifyUser: false,
      }
    }
    return {
      choice: 'use-local',
      shouldDeleteOldDraft: false,
      shouldNotifyUser: false,
    }
  }

  const choice = userChoice ?? 'use-local'
  return {
    choice,
    shouldDeleteOldDraft: choice !== 'use-local',
    shouldNotifyUser: diverged,
  }
}
