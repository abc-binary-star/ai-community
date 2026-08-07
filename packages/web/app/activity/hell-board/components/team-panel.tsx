'use client'

import { useState } from 'react'
import { Crown, History, Loader2, LogOut, Star, UserRoundPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWords } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { Team } from '../lib/types'
import { TeamEmblem } from './team-emblem'

/** 队伍成员满编 5 人，不足时用空槽占位，保证布局稳定 */
const TEAM_SIZE = 5

/**
 * 队伍卡：呈现队伍身份与成员名单，队名右侧留出的空白位放本队时间线入口。
 * 补录 / 队伍管理等队长操作仍收在页头右上角，避免卡片被按钮撑高。
 */
export function TeamPanel({
  team,
  currentMemberId,
  onOpenTimeline,
}: {
  team: Team
  currentMemberId: string
  onOpenTimeline?: () => void
}) {
  // 成员不足 5 人时用空槽补齐，保持卡片高度稳定
  const slots = Array.from({ length: TEAM_SIZE }, (_, i) => team.members[i] ?? null)
  const claimCaptain = useActivityStore((s) => s.claimCaptain)
  const leaveTeam = useActivityStore((s) => s.leaveTeam)
  const archived = useActivityStore((s) => s.archived)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  // 队长位空缺时，本队成员可自助补选（入队时没勾队长也有补救入口）
  const hasCaptain = team.members.some((m) => m.isCaptain)
  const iAmMember = team.members.some((m) => m.id === currentMemberId)
  const iAmCaptain = team.members.some((m) => m.id === currentMemberId && m.isCaptain)
  const canClaim = !hasCaptain && iAmMember && !archived

  const handleClaim = async () => {
    if (!window.confirm('确认成为本队队长？队长负责掷骰、拉人、设置队伍形象与投票。')) return
    setClaiming(true)
    setClaimError(null)
    try {
      await claimCaptain()
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : '设置队长失败')
    } finally {
      setClaiming(false)
    }
  }

  const handleLeave = async () => {
    const warn = iAmCaptain
      ? '你是队长，退出后队长位会空置，需要其他成员重新补选。确认退出？'
      : '确认退出当前队伍？退出后可以重新选择队伍，不用再报名。'
    if (!window.confirm(warn)) return
    setLeaving(true)
    setLeaveError(null)
    try {
      await leaveTeam()
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : '退出队伍失败')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <section
      aria-labelledby="team-heading"
      className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f4edda] p-4 shadow-[4px_4px_0_#292524]"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="team-heading" className="flex min-w-0 items-center gap-2.5 text-sm font-black text-stone-900">
          <span className="min-w-0 flex items-center gap-2.5">
            {/* 徽章本身是圆形盘面，不再套外圈圆环（与棋盘棋子修复一致） */}
            <TeamEmblem emblem={team.emblem} size={40} className="shrink-0 drop-shadow-[2px_2px_0_rgba(41,37,36,0.3)]" />
            <span className="truncate">{team.name}</span>
          </span>
        </h2>
        {/* 头像右侧的空白位放时间线入口，就近可达且不额外占高度 */}
        {onOpenTimeline && (
          <button
            type="button"
            onClick={onOpenTimeline}
            title="本队时间线"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2 text-[11px] font-bold shadow-[2px_2px_0_#292524] transition-all hover:-translate-y-0.5 hover:bg-[#fff4cf] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <History aria-hidden className="size-3" />
            时间线
          </button>
        )}
      </div>

      {/* 队长位空缺提示：任何本队成员都能点击补选，避免队伍无人可掷骰 */}
      {canClaim && (
        <button
          type="button"
          onClick={() => void handleClaim()}
          disabled={claiming}
          className="mt-2.5 flex w-full items-center gap-1.5 rounded-md border-2 border-dashed border-amber-500 bg-[#fff8e5] px-2.5 py-2 text-left text-[11px] font-bold text-amber-800 transition-colors hover:bg-[#fff3d0] disabled:opacity-60"
        >
          {claiming ? <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" /> : <Crown aria-hidden className="size-3.5 shrink-0" />}
          本队暂无队长，点此成为队长
        </button>
      )}
      {claimError && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{claimError}</p>}

      {/* 名单区有界：卡片高度由右栏决定，成员多时名单自身滚动而非撑高卡片 */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-dashed border-[#dccfa8] pt-3.5">
        <h3 className="flex shrink-0 items-center gap-1.5 text-xs font-black tracking-wide text-[#6b4e15]">
          <span aria-hidden className="size-1.5 rotate-45 bg-[#d9a441]" />
          队伍成员
          <span className="ml-auto text-[11px] font-medium text-stone-400">
            {team.members.length} / {TEAM_SIZE}
          </span>
        </h3>
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {slots.map((member, i) =>
            member ? (
              <li
                key={member.id}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs shadow-[1.5px_1.5px_0_#e0d6ba]',
                  member.id === currentMemberId
                    ? 'border-[#d9a441] bg-[#fff3d6] ring-1 ring-[#d9a441]/40'
                    : 'border-[#dccfa8] bg-white/80 hover:bg-[#fdf9ec]',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-stone-800">
                  <span className="truncate">{member.name}</span>
                  {member.isCaptain && <Crown aria-label="队长" className="size-3 shrink-0 text-amber-600" />}
                  {member.id === currentMemberId && <span className="shrink-0 text-[10px] text-emerald-700">你</span>}
                </span>
                <span className="shrink-0 tabular-nums text-stone-500">
                  <span className="inline-flex items-center gap-0.5 text-[#7a5c1e]">
                    <Star aria-hidden className="size-3" />
                    {member.bookCount} 本
                  </span>
                  <span className="ml-2">{formatWords(member.wordCount)}</span>
                </span>
              </li>
            ) : (
              <li
                key={`empty-${i}`}
                aria-hidden
                className="flex items-center gap-2 rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/60 px-2.5 py-2 text-xs text-stone-400"
              >
                <UserRoundPlus className="size-3.5" />
                空位 · 等待队长拉人
              </li>
            ),
          )}
        </ul>
      </div>

      {/* 退出队伍：选错队伍时的补救入口。有痕迹时服务端会拒绝并说明原因 */}
      {iAmMember && !archived && (
        <div className="mt-2.5 shrink-0 border-t border-dashed border-[#dccfa8] pt-2">
          <button
            type="button"
            onClick={() => void handleLeave()}
            disabled={leaving}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-400 transition-colors hover:text-rose-600 disabled:opacity-60"
          >
            {leaving ? <Loader2 aria-hidden className="size-3 animate-spin" /> : <LogOut aria-hidden className="size-3" />}
            退出队伍
          </button>
          {leaveError && <p className="mt-1 text-[11px] font-medium text-rose-600">{leaveError}</p>}
        </div>
      )}
    </section>
  )
}
