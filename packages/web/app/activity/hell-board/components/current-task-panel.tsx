'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dices, Download, Flame, Footprints, Hourglass, Info, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_TYPE_LABEL } from '../lib/board'
import {
  blockedReason,
  canRollDice,
  canSubmitCheckIn,
  formatDuration,
  formatProgressValue,
  formatTileTarget,
  isFallbackDone,
  isTaskDone,
  timerRemainingMs,
} from '../lib/rules'
import { useActivityStore, useTile } from '../lib/store'
import type { Team } from '../lib/types'
import { Dice } from './dice'
import { ExportCheckInDialog } from './export-checkin-dialog'
import { JudgementPanel } from './judgement-panel'
import { ProgressBar } from './progress-bar'

/** 格子编号转中文数字（1-20），与模板「第七格」一致 */
function posText(n: number): string {
  const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']
  return cn[n] ?? String(n)
}

/** 计时惩罚格倒计时。到期后由服务端自动点亮并解锁（P1-6） */
function PenaltyTimer({ team }: { team: Team }) {
  const [remaining, setRemaining] = useState(() => timerRemainingMs(team, Date.now()))

  useEffect(() => {
    const id = setInterval(() => setRemaining(timerRemainingMs(team, Date.now())), 30_000)
    return () => clearInterval(id)
  }, [team])

  return (
    <div className="rounded-lg border-2 border-amber-700 bg-[#fef3c7] p-3 shadow-[3px_3px_0_#292524]">
      <p className="flex items-center gap-1.5 text-sm font-black text-amber-900">
        <Hourglass aria-hidden className="size-4" />
        惩罚计时中
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums text-amber-900">
        {remaining > 0 ? formatDuration(remaining) : '已到期'}
      </p>
      <p className="mt-1.5 text-xs font-medium leading-relaxed text-amber-800">
        计时期间无法添加打卡、无法掷骰。到期后系统自动点亮该格并解锁掷骰，
        期间读过的书可在结束后补提交，正常计入榜单。
      </p>
    </div>
  )
}

export function CurrentTaskPanel({
  team,
  isCaptain,
  readOnly = false,
  onOpenCheckIn,
  onOpenAdvance,
  onOpenFallbackAdvance,
  onOpenManualMove,
}: {
  team: Team
  isCaptain: boolean
  /** 归档态下隐藏全部写操作（P1-7 / 验收标准 12） */
  readOnly?: boolean
  onOpenCheckIn: () => void
  /** 打开「向下一格进发」（手动选择 1–6 格替代掷骰） */
  onOpenAdvance: () => void
  /** 打开「消耗 40 本 · 向下一格进发」（保底计数前进，可摇骰或自选步数） */
  onOpenFallbackAdvance: () => void
  /** 打开「手动移动」（常驻：无需打卡审核，随时点亮当前格并前进） */
  onOpenManualMove: () => void
}) {
  const tile = useTile(team.position)
  const judgement = useActivityStore((s) => s.judgement)
  const lastRoll = useActivityStore((s) => s.lastRoll)
  const rolling = useActivityStore((s) => s.rolling)
  const rollDice = useActivityStore((s) => s.rollDice)
  const fallbackThreshold = useActivityStore((s) => s.fallbackThreshold)
  const checkIns = useActivityStore((s) => s.checkIns)
  const [exportOpen, setExportOpen] = useState(false)

  // 导出当前任务打卡内容（群打卡模板）：队伍名 + 当前格 + 已点亮格子 + 书目与心得。
  // useMemo 必须放在所有条件返回之前（React Hooks 规则），tile 缺失时兜底返回空串。
  const exportText = useMemo(() => {
    if (!tile) return ''
    const lit = Object.keys(team.litTiles)
      .map(Number)
      .sort((a, b) => a - b)
    // 当前已读书目 = 全队整个活动累计通过审核的书目数（成员 bookCount 之和）。
    // 不使用 fallbackCount：队长消耗保底前进时会扣减，不代表累计阅读量。
    const totalBooks = team.members.reduce((sum, m) => sum + m.bookCount, 0)
    const lines: string[] = [
      team.name,
      `当前格：第${posText(team.position)}格：${tile.title}，当前已读书目：${totalBooks}本`,
      `已点亮格子${lit.join(' -> ')}`,
      '',
    ]
    // 当前格本队已通过审核的打卡书目（含心得）
    const books = checkIns
      .filter((c) => c.tileIndex === team.position)
      .flatMap((c) =>
        (c.books ?? [])
          .filter((b) => b.reviewStatus === 'approved')
          .map((b) => ({ memberName: c.memberName, title: b.title, author: b.author, note: b.note })),
      )
    books.forEach((b, i) => {
      lines.push(`${i + 1}. ${b.memberName}《${b.title}》${b.author}`)
      if (b.note) lines.push(b.note)
    })
    return lines.join('\n')
  }, [team, tile, checkIns])

  // 格子定义随棋盘快照下发，加载完成前不渲染任务区
  if (!tile) return null

  const taskDone = isTaskDone(team, tile)
  const fallbackDone = isFallbackDone(team, tile, fallbackThreshold)
  const blocked = blockedReason(team, isCaptain)
  const isPenalty = tile.taskType === 'timed-penalty'
  const canCheckIn = canSubmitCheckIn(team) && !readOnly
  // 保底按钮：任务未完成时，队长可消耗 40 本保底计数向下一格进发（当前格未点亮时）
  const canFallbackAdvance =
    isCaptain &&
    !readOnly &&
    fallbackDone &&
    !taskDone &&
    team.status !== 'timer-running' &&
    team.status !== 'completed' &&
    !team.litTiles[team.position]
  // 常驻手动移动：队长随时可点亮当前格并前进（惩罚计时中与完成后除外，归档态不渲染）
  const canManualMove =
    isCaptain &&
    !readOnly &&
    team.status !== 'timer-running' &&
    team.status !== 'completed'

  return (
    <section aria-labelledby="current-task-heading" className="space-y-3">
      <div className="rounded-lg border-2 border-stone-800 bg-white p-3 shadow-[4px_4px_0_#292524] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-emerald-700">当前格 · 第 {team.position} 格 · 第 {team.lap} 轮</p>
            <h2 id="current-task-heading" className="mt-0.5 text-base font-black text-stone-900">
              {tile.title}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-stone-500">
              {TASK_TYPE_LABEL[tile.taskType]} · 目标 {formatTileTarget(tile)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {lastRoll !== null && <Dice value={lastRoll} rolling={rolling} />}
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              title="导出当前任务打卡内容"
              className="flex h-7 items-center gap-1 rounded-md border-2 border-stone-800 bg-white px-2 text-xs font-bold text-stone-700 shadow-[2px_2px_0_#292524] transition-all hover:bg-[#fff4cf] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <Download aria-hidden className="size-3.5" />
              导出
            </button>
          </div>
        </div>

        {tile.specialRule && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800">
            <Dices aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            特殊判定：{tile.specialRule.label}
          </p>
        )}

        {/* 任务进度与保底进度并列展示（PRD 7.3） */}
        {!isPenalty && (
          <div className="mt-3 space-y-2">
            <ProgressBar
              label="任务进度"
              valueText={`${formatProgressValue(team.tileProgress, tile)} / ${formatProgressValue(tile.target, tile)}`}
              ratio={team.tileProgress / tile.target}
            />
            <ProgressBar
              label="保底进度（全队累计通过审核）"
              valueText={`${team.fallbackCount} / ${fallbackThreshold} 本`}
              ratio={team.fallbackCount / fallbackThreshold}
              tone="amber"
              hint={
                fallbackDone
                  ? '已达保底，队长可消耗 40 本向下一格进发'
                  : '全队读满 40 本后，队长可消耗保底向下一格进发'
              }
            />
          </div>
        )}

        {fallbackDone && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-300 bg-[#fff0b8] px-3 py-1.5 text-xs font-bold text-amber-900">
            <Flame aria-hidden className="size-3.5" />
            保底已达成，队长可点下方按钮消耗 40 本向下一格进发
          </p>
        )}
      </div>

      {isPenalty && team.status === 'timer-running' && <PenaltyTimer team={team} />}

      {judgement && <JudgementPanel team={team} session={judgement} />}

      <div className="space-y-2">
        {readOnly ? (
          <p className="rounded-md border border-stone-300 bg-stone-100 px-3 py-2 text-center text-xs font-bold text-stone-600">
            活动周期已结束，页面为只读归档态
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenCheckIn}
              disabled={!canCheckIn}
              className={cn(
                'flex h-10 w-full items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 text-sm font-black shadow-[3px_3px_0_#292524] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                canCheckIn
                  ? 'bg-[#78c6a3] text-stone-900 hover:bg-[#65b891]'
                  : 'cursor-not-allowed border-stone-300 bg-stone-200 text-stone-400 shadow-none',
              )}
            >
              <PlusCircle aria-hidden className="size-4" />
              提交打卡
            </button>

            {canManualMove && (
              <button
                type="button"
                onClick={onOpenManualMove}
                disabled={rolling}
                title="无需打卡审核，点亮当前格并前进 1–6 格"
                className={cn(
                  'flex h-10 w-full items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 text-sm font-black shadow-[3px_3px_0_#292524] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                  rolling
                    ? 'cursor-not-allowed border-stone-300 bg-stone-200 text-stone-400 shadow-none'
                    : 'bg-stone-800 text-white hover:bg-stone-700',
                )}
              >
                <Footprints aria-hidden className="size-4" />
                手动移动 · 点亮当前格
              </button>
            )}

            {canFallbackAdvance && (
              <button
                type="button"
                onClick={onOpenFallbackAdvance}
                disabled={rolling}
                className={cn(
                  'flex h-10 w-full items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 text-sm font-black shadow-[3px_3px_0_#292524] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                  rolling
                    ? 'cursor-not-allowed border-stone-300 bg-stone-200 text-stone-400 shadow-none'
                    : 'bg-[#ffb703] text-stone-900 hover:bg-[#f5a800]',
                )}
              >
                <Flame aria-hidden className="size-4" />
                消耗 {fallbackThreshold} 本 · 向下一格进发
              </button>
            )}

            {canRollDice(team, isCaptain) && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void rollDice()}
                  disabled={rolling}
                  className={cn(
                    'flex h-10 items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 text-sm font-black shadow-[3px_3px_0_#292524] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                    rolling
                      ? 'cursor-not-allowed border-stone-300 bg-stone-200 text-stone-400 shadow-none'
                      : 'bg-[#ffd166] text-stone-900 hover:bg-[#f5c34f]',
                  )}
                >
                  <Dices aria-hidden className="size-4" />
                  {rolling ? '掷骰中…' : '掷骰前进'}
                </button>
                <button
                  type="button"
                  onClick={onOpenAdvance}
                  disabled={rolling}
                  className={cn(
                    'flex h-10 items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 text-sm font-black shadow-[3px_3px_0_#292524] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                    rolling
                      ? 'cursor-not-allowed border-stone-300 bg-stone-200 text-stone-400 shadow-none'
                      : 'bg-white text-stone-900 hover:bg-[#fff4cf]',
                  )}
                >
                  <Footprints aria-hidden className="size-4" />
                  向下一格进发
                </button>
              </div>
            )}
          </>
        )}

        {taskDone && team.status === 'in-progress' && !fallbackDone && (
          <p className="text-xs font-bold text-emerald-700">任务已达成，等待进入下一步。</p>
        )}

        {blocked && (
          <p className="flex items-start gap-1.5 text-xs text-stone-600">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {blocked}
          </p>
        )}
      </div>

      {exportOpen && <ExportCheckInDialog text={exportText} onClose={() => setExportOpen(false)} />}
    </section>
  )
}
