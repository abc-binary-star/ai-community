'use client'

import { useState } from 'react'
import { Loader2, UserRound, X } from 'lucide-react'
import type { User } from 'shared'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

const MAX_LEN = 30

/**
 * 「我的」弹窗：调整社区昵称（displayName）。
 *
 * 注意与活动内昵称的区别：活动昵称在报名时写入、入队时快照，改这里不会
 * 追改已入队的活动名单；这里改的是社区账号昵称，影响全站展示。
 */
export function MyProfileDialog({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [name, setName] = useState(user?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const dirty = trimmed !== (user?.displayName ?? '')

  const handleSave = async () => {
    if (!trimmed) {
      setError('昵称不能为空')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await api.put<User>('/users/me', { displayName: trimmed })
      setUser(updated)
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
            我的资料
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

        <label htmlFor="my-nickname" className="mt-4 block text-xs font-bold text-stone-700">
          昵称
        </label>
        <input
          id="my-nickname"
          value={name}
          maxLength={MAX_LEN}
          onChange={(e) => setName(e.target.value)}
          placeholder={user?.username ?? '输入昵称'}
          className="mt-1.5 w-full rounded-md border-2 border-stone-800 bg-white px-2.5 py-2 text-sm font-medium shadow-[2px_2px_0_#292524] outline-none focus:bg-[#fffbe9]"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">
          {trimmed.length}/{MAX_LEN} · 影响全站展示。已入队的活动名单沿用入队时的昵称，不会跟着变。
        </p>

        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#ffd166] px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
