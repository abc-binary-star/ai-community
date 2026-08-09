'use client'

import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, Clock, Heart, Loader2, Text, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchMemberCheckIns, likeCheckIn, unlikeCheckIn } from '../lib/api'
import { formatReadingMinutes, formatWords } from '../lib/rules'
import type { MemberCheckInItem, MemberProfile, TeamMember } from '../lib/types'

/**
 * 成员阅读档案弹窗（「全部队伍」→ 点击成员）：
 * 展示已通过审核的累计数据（总本数 / 总字数 / 总时长），
 * 每次打卡可点赞，点赞数实时更新。
 */
export function MemberProfileDialog({
  member,
  teamName,
  onClose,
}: {
  member: TeamMember
  teamName: string
  onClose: () => void
}) {
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openCheckIns, setOpenCheckIns] = useState<Set<string>>(new Set())

  const toggleCheckIn = (id: string) => {
    setOpenCheckIns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    fetchMemberCheckIns(member.id)
      .then((p) => {
        if (alive) setProfile(p)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '档案加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [member.id])

  const toggleLike = async (item: MemberCheckInItem) => {
    if (busyId) return
    setBusyId(item.checkInId)
    setError(null)
    try {
      if (item.likedByMe) {
        await unlikeCheckIn(item.checkInId)
      } else {
        await likeCheckIn(item.checkInId)
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              checkIns: prev.checkIns.map((c) =>
                c.checkInId === item.checkInId
                  ? {
                      ...c,
                      likedByMe: !item.likedByMe,
                      likeCount: Math.max(0, c.likeCount + (item.likedByMe ? -1 : 1)),
                    }
                  : c,
              ),
            }
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-profile-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] p-5 shadow-[6px_6px_0_#292524] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="member-profile-title" className="text-lg font-black text-stone-900">
              {member.name}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-stone-500">
              {teamName}
              {member.isCaptain ? ' · 队长' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-stone-400" />
          </div>
        ) : error ? (
          <p className="mt-4 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
            {error}
          </p>
        ) : profile ? (
          <>
            {/* 累计数据：总本数 / 总字数 / 总时长 */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-md border border-stone-300 bg-white p-2.5 text-center">
                <BookOpen className="mx-auto size-4 text-emerald-700" />
                <p className="mt-1 text-sm font-black text-stone-900">{profile.bookCount}</p>
                <p className="text-[10px] text-stone-500">本（已通过）</p>
              </div>
              <div className="rounded-md border border-stone-300 bg-white p-2.5 text-center">
                <Text className="mx-auto size-4 text-emerald-700" />
                <p className="mt-1 truncate text-sm font-black text-stone-900">
                  {formatWords(profile.wordCount)}
                </p>
                <p className="text-[10px] text-stone-500">总字数</p>
              </div>
              <div className="rounded-md border border-stone-300 bg-white p-2.5 text-center">
                <Clock className="mx-auto size-4 text-emerald-700" />
                <p className="mt-1 truncate text-sm font-black text-stone-900">
                  {formatReadingMinutes(profile.durationMinutes)}
                </p>
                <p className="text-[10px] text-stone-500">总时长</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold text-stone-700">已通过的打卡</p>
              {profile.checkIns.length === 0 ? (
                <p className="mt-2 rounded-md bg-stone-50 px-3 py-4 text-center text-xs text-stone-400">
                  暂无已通过审核的打卡
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {profile.checkIns.map((item) => {
                    const open = openCheckIns.has(item.checkInId)
                    return (
                      <li
                        key={item.checkInId}
                        className="overflow-hidden rounded-md border border-stone-300 bg-white"
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <button
                            type="button"
                            onClick={() => toggleCheckIn(item.checkInId)}
                            aria-expanded={open}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <p className="min-w-0 truncate text-[11px] font-bold text-stone-600">
                              第 {item.tileIndex} 格 · 第 {item.lap} 轮 ·{' '}
                              {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                              <span className="ml-1.5 font-medium text-stone-400">
                                {item.books.length} 本
                              </span>
                            </p>
                            <ChevronDown
                              aria-hidden
                              className={cn(
                                'size-3.5 shrink-0 text-stone-400 transition-transform',
                                open && 'rotate-180',
                              )}
                            />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === item.checkInId}
                            onClick={() => void toggleLike(item)}
                            aria-pressed={item.likedByMe}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-300 px-2 py-0.5 text-[11px] font-bold transition-colors disabled:opacity-50"
                          >
                            <Heart
                              className={cn(
                                'size-3',
                                item.likedByMe ? 'fill-rose-500 text-rose-500' : 'text-stone-400',
                              )}
                            />
                            {item.likeCount}
                          </button>
                        </div>
                        {open && (
                          <ul className="space-y-1 border-t border-stone-200 px-2.5 py-2">
                            {item.books.map((b) => (
                              <li
                                key={b.id}
                                className="flex items-baseline justify-between gap-2 text-[11px]"
                              >
                                <span className="truncate text-stone-800">
                                  《{b.title}》 {b.author}
                                </span>
                                <span className="shrink-0 text-stone-400">
                                  {formatWords(b.wordCount)}
                                  {b.durationMinutes
                                    ? ` · ${formatReadingMinutes(b.durationMinutes)}`
                                    : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
