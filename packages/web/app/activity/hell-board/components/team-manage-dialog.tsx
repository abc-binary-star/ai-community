'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Lock, UserPlus, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { captainAddMember, captainUpdateTeam, fetchEnrollments } from '../lib/api'
import { EMBLEMS } from '../lib/emblems'
import { useActivityStore } from '../lib/store'
import type { EnrollmentItem, Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/**
 * 队长队伍管理弹窗（仅队长可见）：
 * 1. 更换队名（随时可改）
 * 2. 一次性选择队伍形象（服务端已落库后不可更换，选择前有确认提示）
 * 3. 从报名名单拉人入队（未报名者不允许，每人只能属于一个小组）
 */
export function TeamManageDialog({
  team,
  onClose,
}: {
  team: Team
  onClose: () => void
}) {
  const refresh = useActivityStore((s) => s.refresh)
  const [name, setName] = useState(team.name)
  const emblemLocked = Boolean(team.emblemSet)
  const [emblem, setEmblem] = useState<string | undefined>(emblemLocked ? team.emblem : undefined)
  const [enrollments, setEnrollments] = useState<EnrollmentItem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEnrollments = useCallback(async () => {
    try {
      setEnrollments(await fetchEnrollments())
    } catch (err) {
      setError(err instanceof Error ? err.message : '报名名单加载失败')
    }
  }, [])

  useEffect(() => {
    void loadEnrollments()
  }, [loadEnrollments])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('队名不能为空')
      return
    }
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const payload: { name: string; color: string; emblem?: string } = {
        name: trimmed,
        color: team.color,
      }
      if (!emblemLocked && emblem) {
        payload.emblem = emblem
      }
      await captainUpdateTeam(payload)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async (userId: string) => {
    if (addingId) return
    setAddingId(userId)
    setError(null)
    try {
      await captainAddMember(userId)
      await Promise.all([loadEnrollments(), refresh()])
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉人入队失败')
    } finally {
      setAddingId(null)
    }
  }

  const pending = (enrollments ?? []).filter((e) => !e.joined)
  const joined = (enrollments ?? []).filter((e) => e.joined)
  const emblemName = EMBLEMS.find((item) => item.key === emblem)?.name ?? '未选择'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-manage-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border-2 border-stone-800 bg-[#f7f6ed] p-5 shadow-[5px_5px_0_#292524] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="team-manage-title" className="flex items-center gap-2 text-lg font-black text-stone-900">
              <Users className="size-4 text-emerald-700" />
              队伍管理
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              队名随时可改；形象与成员管理仅队长可操作
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-5 overflow-y-auto pr-1">
          {/* 队名 */}
          <section>
            <h3 className="text-xs font-black uppercase tracking-wide text-stone-500">队名</h3>
            <input
              type="text"
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入队伍名称"
              className="mt-2 w-full rounded-md border-2 border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-900 outline-none transition-colors focus:border-[#d9a441]"
            />
          </section>

          {/* 队伍形象：一次性选择 */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-stone-500">
              队伍形象
              {emblemLocked && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-amber-800">
                  <Lock className="size-2.5" />已确定，不可更换
                </span>
              )}
            </h3>
            {emblemLocked ? (
              <div className="mt-2 flex items-center gap-3 rounded-md border-2 border-[#9b772f] bg-[#fff8e5] px-3 py-2.5 shadow-[inset_0_0_0_1px_#ead39b]">
                <TeamEmblem emblem={emblem} size={52} className="shrink-0" />
                <div className="text-[11px] leading-relaxed text-stone-600">
                  <p className="font-black text-stone-900">当前形象：{emblemName}</p>
                  <p>徽章已经铸印，无法再次更换。</p>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1.5 text-[11px] text-stone-500">选择一枚阵营徽章。保存后即完成铸印，无法更换。</p>
                <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {EMBLEMS.map((spec) => {
                    const active = emblem === spec.key
                    return (
                      <li key={spec.key}>
                        <button
                          type="button"
                          onClick={() => setEmblem(spec.key)}
                          aria-pressed={active}
                          title={spec.name}
                          className={cn(
                            'flex min-h-[102px] w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 bg-[#eee8d8] p-2 transition-[transform,border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b6b2c] focus-visible:ring-offset-2',
                            active
                              ? 'border-[#8b6b2c] bg-[#fff8e5] shadow-[3px_3px_0_#8b6b2c] -translate-y-0.5'
                              : 'border-[#c9c0ac] hover:border-[#8b6b2c] hover:bg-[#f8f1df]',
                          )}
                        >
                          <TeamEmblem emblem={spec.key} size={54} />
                          <span className={cn('text-[11px] font-black', active ? 'text-amber-900' : 'text-stone-600')}>
                            {spec.name}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          {/* 报名名单拉人 */}
          <section>
            <h3 className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-stone-500">
              报名名单
              <span className="text-[10px] font-bold normal-case text-stone-400">
                已报名 {enrollments ? enrollments.length : '…'} 人 · 待入队 {pending.length} 人
              </span>
            </h3>
            {!enrollments ? (
              <p className="mt-2 flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-400">
                <Loader2 className="size-3.5 animate-spin" />正在加载报名名单…
              </p>
            ) : enrollments.length === 0 ? (
              <p className="mt-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-500">
                暂无人员报名，稍后回来看看
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {pending.map((e) => (
                  <li
                    key={e.userId}
                    className="flex items-center justify-between gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50/60 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-stone-800">
                      <span className="truncate">{e.name}</span>
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">待入队</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleAdd(e.userId)}
                      disabled={addingId !== null}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-800 shadow-[2px_2px_0_#292524] transition-all hover:bg-[#ffd166] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {addingId === e.userId ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
                      拉入队伍
                    </button>
                  </li>
                ))}
                {joined.map((e) => (
                  <li
                    key={e.userId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2 opacity-80"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-stone-500">
                      <span className="truncate">{e.name}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-stone-400">
                      <Check className="size-3" />
                      {e.teamId === team.id ? '已在队伍' : `在「${e.teamName ?? '其他队伍'}」`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-md border-2 border-stone-400 text-sm font-bold text-stone-600 transition-colors hover:bg-stone-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#ffd166] text-sm font-black text-stone-900 shadow-[3px_3px_0_#292524] transition-all hover:bg-[#f5c34f] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
