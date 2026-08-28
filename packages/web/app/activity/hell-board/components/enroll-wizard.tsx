'use client'

import { useState } from 'react'
import { Loader2, LogIn, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RAINBOW, RAINBOW_ORDER } from '../lib/board'
import { colorLabel } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/**
 * 入队向导：报名 → 选队伍 + 选队长 + 认领彩虹色。
 * 读书/打卡在群里进行，这里只完成身份入位。
 */
export function EnrollWizard() {
  const teams = useActivityStore((s) => s.teams)
  const enrolled = useActivityStore((s) => s.enrolled)
  const myTeamId = useActivityStore((s) => s.myTeamId)
  const myMemberId = useActivityStore((s) => s.myMemberId)
  const enroll = useActivityStore((s) => s.enroll)
  const joinTeam = useActivityStore((s) => s.joinTeam)
  const claimColor = useActivityStore((s) => s.claimColor)
  const claimCaptain = useActivityStore((s) => s.claimCaptain)
  const rolling = useActivityStore((s) => s.rolling)

  const [nickname, setNickname] = useState('')
  const [teamId, setTeamId] = useState('')
  const [color, setColor] = useState('')
  const [wantCaptain, setWantCaptain] = useState(false)
  const [error, setError] = useState('')

  const openTeams = teams.filter((t) => t.members.length < 7)
  const myTeam = teams.find((t) => t.id === myTeamId) ?? null

  const claimedBy = (team: Team) => new Set(team.members.map((m) => m.color).filter(Boolean))
  const freeColors = (team: Team | null) => {
    if (!team) return RAINBOW_ORDER
    const taken = claimedBy(team)
    return RAINBOW_ORDER.filter((c) => !taken.has(c))
  }

  async function run(fn: () => Promise<void>) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && (
        <p className="rounded-md border-2 border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">
          {error}
        </p>
      )}

      {/* 报名 */}
      {!enrolled ? (
        <div className="rounded-lg border-2 border-stone-800 bg-white p-3 shadow-[3px_3px_0_#292524]">
          <p className="flex items-center gap-1.5 text-[12px] font-black text-stone-900">
            <LogIn className="size-3.5 text-emerald-700" />
            报名《九月彩虹桥》
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
            报名后才能选择队伍入队。读书与打卡在群里完成，这里只做棋盘记录。
          </p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="活动昵称（可选）"
            maxLength={50}
            className="mt-2 h-9 w-full rounded-md border-2 border-stone-700 bg-[#fbf6ea] px-2.5 text-sm outline-none focus:border-amber-600"
          />
          <button
            type="button"
            disabled={rolling}
            onClick={() => void run(() => enroll(nickname))}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border-2 border-stone-800 bg-[#22c55e] py-2 text-[12px] font-black text-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-60"
          >
            {rolling ? <Loader2 className="size-3.5 animate-spin" /> : null}
            报名
          </button>
        </div>
      ) : (
        /* 已报名：选队 + 认领颜色 */
        <div className="rounded-lg border-2 border-stone-800 bg-white p-3 shadow-[3px_3px_0_#292524]">
          <p className="flex items-center gap-1.5 text-[12px] font-black text-stone-900">
            <Users className="size-3.5 text-emerald-700" />
            选择队伍（7 人满编）
          </p>
          <div className="mt-2 grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto">
            {openTeams.map((t) => {
              const meHere = t.id === myTeamId
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={rolling}
                  onClick={() => {
                    setTeamId(t.id)
                    setColor(meHere ? (t.members.find((m) => m.id === myMemberId)?.color ?? '') : '')
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border-2 px-2 py-1.5 text-left transition-colors',
                    teamId === t.id ? 'border-amber-700 bg-[#fff1c2]' : 'border-stone-300 bg-[#fbf6ea] hover:border-amber-500',
                  )}
                >
                  <TeamEmblem emblem={t.emblem} accent={t.color} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-black text-stone-800">{t.name}</span>
                    <span className="block text-[9px] font-medium text-stone-500">{t.members.length}/7 人</span>
                  </span>
                </button>
              )
            })}
          </div>

          {teamId && (
            <>
              <p className="mt-2.5 text-[10px] font-black text-[#6b4e15]">认领彩虹色（一人一色）</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {freeColors(openTeams.find((t) => t.id === teamId) ?? null).map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={rolling}
                    onClick={() => setColor(c)}
                    className={cn(
                      'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border-2 border-stone-700 px-2 text-[11px] font-black text-white shadow-[1px_1px_0_rgba(41,37,36,0.3)] transition-transform hover:-translate-y-0.5',
                      color === c && 'scale-110 ring-2 ring-amber-400 ring-offset-1',
                    )}
                    style={{ backgroundColor: RAINBOW[c].hex }}
                    title={`认领${colorLabel(c)}色`}
                  >
                    {colorLabel(c)}
                  </button>
                ))}
              </div>

              {myTeamId ? (
                /* 已在队：只切换颜色 */
                <button
                  type="button"
                  disabled={!color || rolling}
                  onClick={() => void run(() => claimColor(color))}
                  className="mt-2.5 w-full rounded-md border-2 border-stone-800 bg-[#ffd166] py-2 text-[12px] font-black text-[#4a3306] shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50"
                >
                  确认认领 {colorLabel(color)} 色
                </button>
              ) : (
                <>
                  <label className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-stone-600">
                    <input type="checkbox" checked={wantCaptain} onChange={(e) => setWantCaptain(e.target.checked)} />
                    我当队长（全队掷骰由队长在群里发起并录入）
                  </label>
                  <button
                    type="button"
                    disabled={!teamId || !color || rolling}
                    onClick={() => void run(() => joinTeam(teamId, wantCaptain, color))}
                    className="mt-2 w-full rounded-md border-2 border-stone-800 bg-[#22c55e] py-2 text-[12px] font-black text-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50"
                  >
                    {rolling ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : '加入队伍'}
                  </button>
                </>
              )}
            </>
          )}

          {myTeam && <p className="mt-2 text-[10px] font-medium text-emerald-700">你已在「{myTeam.name}」，可在此调整认领颜色。</p>}
          {myTeam && (
            <button
              type="button"
              disabled={rolling}
              onClick={() => void run(() => claimCaptain())}
              className="mt-2 w-full rounded-md border-2 border-stone-300 bg-white py-1.5 text-[11px] font-bold text-stone-600 hover:border-amber-500"
            >
              队长位空缺时，补选我为队长
            </button>
          )}
        </div>
      )}
    </div>
  )
}