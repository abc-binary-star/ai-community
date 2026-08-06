'use client'

import { CheckCircle2, Dices, XCircle } from 'lucide-react'
import { matchesRule } from '../lib/board'
import { useActivityStore } from '../lib/store'
import type { JudgementSession, Team } from '../lib/types'
import { Dice } from './dice'

/**
 * 特殊判定（P0-2 / PRD 10.3）：队伍全部在册成员各掷一次，全部满足条件才通过。
 *
 * 掷骰点数与聚合结果均由服务端计算：最后一名成员掷完时服务端立即结算并推进状态，
 * 前端只展示进度与结果，不做本地判定（PRD 第 12 节服务端权威）。
 */
export function JudgementPanel({ team, session }: { team: Team; session: JudgementSession }) {
  const rollJudgement = useActivityStore((s) => s.rollJudgement)
  const rolling = useActivityStore((s) => s.rolling)
  const myMemberId = useActivityStore((s) => s.myMemberId)
  const archived = useActivityStore((s) => s.archived)

  const rolledCount = Object.values(session.rolls).filter((v) => typeof v === 'number').length
  const myRolled = myMemberId ? typeof session.rolls[myMemberId] === 'number' : true

  return (
    <div className="rounded-lg border-2 border-stone-800 bg-violet-50 p-4 shadow-[3px_3px_0_#292524]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-violet-900">特殊判定进行中</p>
          <p className="mt-0.5 text-xs text-violet-700">{session.rule.label}</p>
        </div>
        <span className="shrink-0 text-xs text-stone-500">
          {rolledCount}/{team.members.length} 人已掷
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {team.members.map((member) => {
          const value = session.rolls[member.id]
          const ok = typeof value === 'number' ? matchesRule(session.rule.kind, value) : null
          return (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 rounded-md border border-violet-200 bg-white px-3 py-2"
            >
              <span className="flex items-center gap-2 text-xs text-stone-800">
                {member.name}
                {member.isCaptain && (
                  <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">队长</span>
                )}
                {member.id === myMemberId && (
                  <span className="rounded bg-sky-500/20 px-1 text-[10px] text-sky-300">我</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {typeof value === 'number' ? (
                  <>
                    <Dice value={value} size="sm" />
                    {ok ? (
                      <CheckCircle2 aria-label="满足条件" className="size-4 text-emerald-400" />
                    ) : (
                      <XCircle aria-label="不满足条件" className="size-4 text-rose-400" />
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-stone-400">待掷骰</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {/* 每人只能掷自己的那一次，不支持代掷 */}
      {!myRolled && !session.result && !archived && (
        <button
          type="button"
          onClick={() => void rollJudgement()}
          disabled={rolling}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 bg-violet-500 text-xs font-black text-white shadow-[3px_3px_0_#292524] transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
        >
          <Dices aria-hidden className="size-3.5" />
          {rolling ? '掷骰中…' : '我来掷骰'}
        </button>
      )}

      {myRolled && !session.result && (
        <p className="mt-3 text-xs text-stone-500">你已掷骰，等待其他成员完成。</p>
      )}

      {session.result === 'passed' && (
        <p className="mt-3 text-xs text-emerald-700">全员满足条件，判定通过，队长可以掷骰前进。</p>
      )}

      {session.result === 'failed' && (
        <p className="mt-3 text-xs text-rose-700">
          判定失败，本格任务进度已清零重做，保底计数保留（P0-3）。
          重新达成任务后会再次进入判定。
        </p>
      )}
    </div>
  )
}
