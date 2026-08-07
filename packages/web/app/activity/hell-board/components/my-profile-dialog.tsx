'use client'

import { useState } from 'react'
import { Loader2, MessageSquareWarning, UserRound, X } from 'lucide-react'
import { useActivityStore } from '../lib/store'
import { FeedbackDialog } from './feedback-dialog'

const MAX_LEN = 50

/**
 * 「我的」弹窗：修改活动内昵称。
 *
 * 这个昵称决定你在榜单、队伍名单、时间线里的显示名，只在本活动内生效，
 * 不影响社区账号昵称（那个在站内设置页改）。留空则回退到账号昵称。
 */
export function MyProfileDialog({ onClose }: { onClose: () => void }) {
  const nickname = useActivityStore((s) => s.nickname)
  const updateNickname = useActivityStore((s) => s.updateNickname)
  const enrolled = useActivityStore((s) => s.enrolled)
  const [name, setName] = useState(nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)

  const trimmed = name.trim()
  const dirty = trimmed !== (nickname ?? '')

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateNickname(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border-2 border-stone-800 bg-[#fffdf4] p-5 shadow-[6px_6px_0_#292524]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="my-profile-title" className="flex items-center gap-2 text-sm font-black text-stone-900">
            <UserRound aria-hidden className="size-4 text-emerald-700" />
            我的活动昵称
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {!enrolled ? (
          <p className="mt-4 text-xs font-medium text-stone-600">
            还没报名，报名后就能设置活动昵称了。
          </p>
        ) : (
          <>
            <label htmlFor="my-nickname" className="mt-4 block text-xs font-bold text-stone-700">
              昵称
            </label>
            <input
              id="my-nickname"
              value={name}
              maxLength={MAX_LEN}
              onChange={(e) => setName(e.target.value)}
              placeholder="留空则用账号昵称"
              className="mt-1.5 w-full rounded-md border-2 border-stone-800 bg-white px-2.5 py-2 text-sm font-medium shadow-[2px_2px_0_#292524] outline-none focus:bg-[#fffbe9]"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">
              {trimmed.length}/{MAX_LEN} · 决定你在榜单、队伍名单和时间线里的显示名，改完立即生效。只在本活动内使用，不影响社区账号昵称。
            </p>
          </>
        )}

        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <MessageSquareWarning aria-hidden className="size-3.5 text-emerald-700" />
            反馈
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            取消
          </button>
          {enrolled && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#ffd166] px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
              保存
            </button>
          )}
        </div>
      </div>

      {showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} />}
    </div>
  )
}
