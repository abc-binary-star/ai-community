'use client'

import { useState } from 'react'
import { Crown, Loader2, ShieldCheck, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActivityStore } from '../lib/store'
import { TeamEmblem } from './team-emblem'

/**
 * 报名向导（自助流程）：
 * 第 1 步 填写活动内昵称并报名；第 2 步 从队伍列表自助选组，
 * 队长位空缺时可同步选择成为队长。每队仅一名队长、满员后不可再加入。
 */
export function EnrollWizard() {
  const teams = useActivityStore((s) => s.teams)
  const enrolled = useActivityStore((s) => s.enrolled)
  const enrolling = useActivityStore((s) => s.enrolling)
  const error = useActivityStore((s) => s.error)
  const enroll = useActivityStore((s) => s.enroll)
  const joinTeam = useActivityStore((s) => s.joinTeam)
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState<string | null>(null)

  const submitEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    await enroll(nickname.trim())
  }

  const submitJoin = async (teamId: string, isCaptain: boolean) => {
    if (joining) return
    setJoining(`${teamId}:${isCaptain}`)
    try {
      await joinTeam(teamId, isCaptain)
    } catch {
      // 错误已写入全局 error，由页面兜底提示展示
    } finally {
      setJoining(null)
    }
  }

  // 第 2 步：选择组别
  if (enrolled) {
    return (
      <div>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
          报名成功！选择一个小组加入即可开始活动。
          <span className="mt-1 block text-[11px] text-stone-500">
            每队至多 5 人；队长位空缺时可选择成为队长（一队仅一名队长）。
          </span>
        </p>

        <ul className="mt-3 space-y-2">
          {teams.map((team) => {
            const full = team.members.length >= 5
            const hasCaptain = team.members.some((m) => m.isCaptain)
            const busy = joining?.startsWith(team.id) ?? false
            return (
              <li
                key={team.id}
                className={cn(
                  'rounded-lg border-2 border-[#d9c9a3] bg-gradient-to-b from-[#fffdf4] to-[#f6efdb] p-3 shadow-[2px_2px_0_#e0d6ba]',
                  full && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 rounded-full border-2 border-[#8b6b2c] bg-[#fffdf4] p-[2px]">
                    <TeamEmblem emblem={team.emblem} size={30} className="block" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-stone-900">{team.name}</p>
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
                      <span className="tabular-nums">{team.members.length} / 5 人</span>
                      {hasCaptain ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-700">
                          <Crown aria-hidden className="size-3" />
                          队长已定
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700">
                          <ShieldCheck aria-hidden className="size-3" />
                          队长空缺
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {!full && (
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => void submitJoin(team.id, false)}
                      disabled={busy}
                      className={cn(
                        'inline-flex h-8 items-center justify-center gap-1 rounded-md border-2 border-stone-800 bg-white text-[11px] font-black text-stone-700 shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
                        busy && 'cursor-wait opacity-70',
                      )}
                    >
                      {busy && joining === `${team.id}:false` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <UserPlus className="size-3" />
                      )}
                      加入本队
                    </button>
                    {!hasCaptain && (
                      <button
                        type="button"
                        onClick={() => void submitJoin(team.id, true)}
                        disabled={busy}
                        className={cn(
                          'inline-flex h-8 items-center justify-center gap-1 rounded-md border-2 border-stone-800 bg-[#ffd166] text-[11px] font-black text-stone-900 shadow-[2px_2px_0_#292524] transition-all hover:bg-[#f5c34f] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
                          busy && 'cursor-wait opacity-70',
                        )}
                      >
                        {busy && joining === `${team.id}:true` ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Crown className="size-3" />
                        )}
                        成为队长
                      </button>
                    )}
                  </div>
                )}
                {full && (
                  <p className="mt-2 text-center text-[11px] font-bold text-stone-400">该队伍已满员</p>
                )}
              </li>
            )
          })}
        </ul>

        {error && <p className="mt-2 text-xs font-bold text-rose-700">{error}</p>}
      </div>
    )
  }

  // 第 1 步：填写昵称并报名
  return (
    <form onSubmit={(e) => void submitEnroll(e)} className="mt-3">
      <label htmlFor="enroll-nickname" className="block text-xs font-bold text-stone-600">
        活动内昵称
        <span className="ml-1 font-medium text-stone-400">（用于榜单与成员列表展示，可不填）</span>
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="enroll-nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={50}
          placeholder="你的昵称"
          className="h-9 min-w-0 flex-1 rounded-md border-2 border-stone-800 bg-white px-2.5 text-xs font-medium text-stone-900 shadow-[2px_2px_0_#292524] outline-none placeholder:text-stone-400 focus:border-emerald-700"
        />
        <button
          type="submit"
          disabled={enrolling}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#ffd166] px-3 text-xs font-black text-stone-900 shadow-[3px_3px_0_#292524] transition-all hover:bg-[#f5c34f] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
            enrolling && 'cursor-not-allowed opacity-70',
          )}
        >
          {enrolling ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          {enrolling ? '报名中…' : '报名'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-rose-700">{error}</p>}
    </form>
  )
}
