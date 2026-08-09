'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, Crown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchRanking } from '../lib/api'
import { formatWords } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import type { RankingMetric, RankingRow, RankingSubject, Team, TeamMember } from '../lib/types'
import { MemberProfileDialog } from './member-profile-dialog'
import { TeamEmblem } from './team-emblem'

type TabKey = 'ranking' | 'lit'

/** 榜单只展示前四名，保证卡片高度与队伍面板一致 */
const RANK_LIMIT = 4

/**
 * 前四名的奖牌配色：金 / 银 / 铜 / 铁。
 * 榜单只取前四，四个名次各有辨识度，比统一金色更容易一眼读出排位。
 */
const MEDAL_STYLES: Record<number, string> = {
  1: 'border-[#8b6b2c] bg-gradient-to-b from-[#ffe066] to-[#f0b429] text-[#5c430d] shadow-[1px_1px_0_rgba(139,107,44,0.5)]',
  2: 'border-[#8c8c94] bg-gradient-to-b from-[#f3f4f6] to-[#c9ccd3] text-[#4b4f57] shadow-[1px_1px_0_rgba(120,124,132,0.5)]',
  3: 'border-[#8a5a33] bg-gradient-to-b from-[#e8a87c] to-[#c4703a] text-[#4a2a12] shadow-[1px_1px_0_rgba(138,90,51,0.5)]',
  4: 'border-[#6b7280] bg-gradient-to-b from-[#9ca3af] to-[#6b7280] text-white shadow-[1px_1px_0_rgba(75,85,99,0.5)]',
}

function RankRow({
  row,
  metric,
  emblem,
  onClick,
}: {
  row: RankingRow
  metric: RankingMetric | 'lit'
  emblem?: string
  onClick?: (row: RankingRow) => void
}) {
  const medal = MEDAL_STYLES[row.rank]
  const cls = cn(
    'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-xs shadow-[1.5px_1.5px_0_#e0d6ba]',
    onClick && 'cursor-pointer transition-colors',
    // 高亮当前用户与其所属队伍的位置（PRD 第 11 节）
    row.isSelf
      ? 'border-[#d9a441] bg-[#fff3d6] ring-1 ring-[#d9a441]/40'
      : 'border-[#dccfa8] bg-white/80 hover:bg-[#fdf9ec]',
  )
  const content = (
    <>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-black',
          medal ?? 'border-[#c9b98f] bg-[#f4edda] text-stone-500',
        )}
      >
        {row.rank}
      </span>
      {emblem ? (
        <TeamEmblem emblem={emblem} size={22} className="shrink-0" />
      ) : (
        <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-stone-500/50" style={{ backgroundColor: row.color }} />
      )}
      <span className="min-w-0 flex-1 truncate font-bold text-stone-800">
        {row.name}
        {row.teamName && <span className="ml-1 font-medium text-stone-400">· {row.teamName}</span>}
        {row.isSelf && <span className="ml-1 text-[10px] font-black text-emerald-700">你</span>}
      </span>
      <span className="shrink-0 tabular-nums font-black text-[#7a5c1e]">
        {metric === 'books' && `${row.bookCount} 本`}
        {metric === 'words' && formatWords(row.wordCount)}
        {metric === 'lit' && `${row.litCount} 格`}
      </span>
    </>
  )
  return onClick ? (
    <button type="button" title="查看详情" onClick={() => onClick(row)} className={cls}>
      {content}
    </button>
  ) : (
    <li className={cls}>{content}</li>
  )
}

/** 榜单页眉：菱形饰 + 大写窄间距标题 + 渐隐金线 */
function PanelHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="size-2 rotate-45 bg-[#d9a441] shadow-[1px_1px_0_#8b6b2c]" />
      <h2 id={id} className="text-[13px] font-black uppercase tracking-[0.16em] text-[#6b4e15]">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#d9a441]/70 to-transparent" />
    </div>
  )
}

/** 金色羊皮纸分段控件：内凹外框 + 亮金选中态 */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly [T, string][]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role={ariaLabel === '榜单类型' ? 'tablist' : undefined}
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-1 rounded-md border border-[#c9b98f] bg-[#efe6cd] p-1 shadow-[inset_0_1px_2px_rgba(139,107,44,0.25)]"
    >
      {options.map(([key, label]) => (
        <button
          key={key}
          role={ariaLabel === '榜单类型' ? 'tab' : undefined}
          type="button"
          aria-selected={ariaLabel === '榜单类型' ? value === key : undefined}
          aria-pressed={ariaLabel !== '榜单类型' ? value === key : undefined}
          onClick={() => onChange(key)}
          className={cn(
            'rounded px-2 py-1.5 text-[11px] font-bold transition-colors',
            value === key
              ? 'bg-[#ffd166] text-[#5c430d] shadow-[0_1px_0_rgba(139,107,44,0.35)]'
              : 'text-[#8a7a55] hover:bg-white/70 hover:text-[#5c430d]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * 榜单区：书目榜 / 字数榜 × 队伍 / 个人，另设独立口径的点亮进度榜（PRD 第 11 节）。
 * 名次与并列规则均由服务端计算，前端只做展示与切换。
 */
export function RankingPanel() {
  const [tab, setTab] = useState<TabKey>('ranking')
  const [metric, setMetric] = useState<RankingMetric>('books')
  const [subject, setSubject] = useState<RankingSubject>('team')
  const [rows, setRows] = useState<RankingRow[]>([])
  const [profileOf, setProfileOf] = useState<{ member: TeamMember; teamName: string } | null>(null)
  const [teamDetail, setTeamDetail] = useState<Team | null>(null)

  // 点亮榜随棋盘轮询一起刷新，避免重复请求
  const litRows = useActivityStore((s) => s.litRanking)
  const teams = useActivityStore((s) => s.teams)

  // 队伍榜（含点亮榜）展示队伍形象徽章；个人榜按 id 匹配不到队伍时退化为色点
  const emblemOf = (row: RankingRow) => teams.find((t) => t.id === row.id)?.emblem

  useEffect(() => {
    let alive = true
    fetchRanking(metric, subject)
      .then((items) => {
        if (alive) setRows(items)
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [metric, subject])

  // 个人榜行点击 → 直接打开成员阅读档案；队伍榜 / 点亮榜行点击 → 先看队伍成员
  const handleRowClick = (row: RankingRow) => {
    if (subject === 'member') {
      const team = teams.find((t) => t.members.some((m) => m.id === row.id))
      const tm = team?.members.find((m) => m.id === row.id)
      setProfileOf({
        member: {
          id: row.id,
          name: row.name,
          isCaptain: tm?.isCaptain ?? false,
          bookCount: row.bookCount,
          wordCount: row.wordCount,
        },
        teamName: row.teamName ?? team?.name ?? '',
      })
      return
    }
    const team = teams.find((t) => t.id === row.id)
    if (team) setTeamDetail(team)
  }

  return (
    <section
      aria-labelledby="ranking-heading"
      className="flex h-full flex-col rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f4edda] p-4 shadow-[4px_4px_0_#292524]"
    >
      <PanelHeading id="ranking-heading">榜单</PanelHeading>

      <div className="mt-3">
        <Segmented
          options={[
            ['ranking', '书目 / 字数榜'],
            ['lit', '点亮进度榜'],
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="榜单类型"
        />
      </div>

      {tab === 'ranking' ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Segmented
              options={[
                ['books', '书目'],
                ['words', '字数'],
              ]}
              value={metric}
              onChange={setMetric}
              ariaLabel="排行口径"
            />
            <Segmented
              options={[
                ['team', '队伍'],
                ['member', '个人'],
              ]}
              value={subject}
              onChange={setSubject}
              ariaLabel="排行对象"
            />
          </div>

          <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {rows.slice(0, RANK_LIMIT).map((row) => (
              <RankRow key={row.id} row={row} metric={metric} emblem={emblemOf(row)} onClick={handleRowClick} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {litRows.slice(0, RANK_LIMIT).map((row) => (
              <RankRow key={row.id} row={row} metric="lit" emblem={emblemOf(row)} onClick={handleRowClick} />
            ))}
          </ul>
          <p className="mt-2 flex items-start gap-1.5 border-t border-dashed border-[#dccfa8] pt-2 text-[11px] leading-relaxed text-stone-500">
            <span aria-hidden className="mt-1 size-1 shrink-0 rounded-full bg-[#d9a441]" />
            活动主进度看板，用于周期结束时的胜负判定，口径与书目 / 字数榜独立。
          </p>
        </>
      )}

      {profileOf && (
        <MemberProfileDialog
          member={profileOf.member}
          teamName={profileOf.teamName}
          onClose={() => setProfileOf(null)}
        />
      )}
      {teamDetail && (
        <TeamMembersDialog
          team={teamDetail}
          onClose={() => setTeamDetail(null)}
          onSelectMember={(m) => {
            setProfileOf({ member: m, teamName: teamDetail.name })
            setTeamDetail(null)
          }}
        />
      )}
    </section>
  )
}

/** 队伍成员列表弹窗（榜单 → 点击队伍行）：列出成员，点击打开该成员阅读档案 */
function TeamMembersDialog({
  team,
  onSelectMember,
  onClose,
}: {
  team: Team
  onSelectMember: (member: TeamMember) => void
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-members-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] p-5 shadow-[6px_6px_0_#292524] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <TeamEmblem emblem={team.emblem} size={32} className="shrink-0 drop-shadow-[1.5px_1.5px_0_rgba(41,37,36,0.3)]" />
            <div className="min-w-0">
              <h2 id="team-members-title" className="truncate text-base font-black text-stone-900">
                {team.name}
              </h2>
              <p className="mt-0.5 text-[11px] font-medium text-stone-500">
                第 {team.position} 格 · 第 {team.lap} 圈 · {team.members.length} 名成员
              </p>
            </div>
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

        <p className="mt-4 text-xs font-bold text-stone-700">点击成员查看阅读详情</p>
        <ul className="mt-2 space-y-1.5">
          {team.members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelectMember(m)}
                className="flex w-full items-center gap-2 rounded-md border border-[#dccfa8] bg-white/80 px-2.5 py-2 text-left text-xs shadow-[1.5px_1.5px_0_#e0d6ba] transition-colors hover:bg-[#fdf9ec]"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5 font-bold text-stone-800">
                  <span className="truncate">{m.name}</span>
                  {m.isCaptain && <Crown aria-label="队长" className="size-3 shrink-0 text-amber-600" />}
                </span>
                <span className="shrink-0 tabular-nums text-[#7a5c1e]">
                  <BookOpen aria-hidden className="mr-0.5 inline size-3" />
                  {m.bookCount} 本
                  <span className="ml-1.5 text-stone-500">{formatWords(m.wordCount)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
