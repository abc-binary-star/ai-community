'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dices, Hourglass, Loader2, Lock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RULES, TASK_TYPE_LABEL } from '../lib/board'
import { fetchTileDetail } from '../lib/api'
import { formatTileTarget, formatWords } from '../lib/rules'
import { useActivityStore, useTile } from '../lib/store'
import type { LitReason, TileDetail, TileRecord } from '../lib/types'
import { ReviewBadge } from './review-badge'
import { TeamEmblem } from './team-emblem'

const LIT_LABEL: Record<LitReason, string> = {
  task: '任务达成',
  fallback: '保底完成',
  timer: '计时到期',
  manual: '人工修正',
}

/**
 * 格子打卡记录（PRD 8.2 / 验收标准 11）：
 * 所有登录用户可见已打卡小组汇总；仅本组成员可见本组完整书目清单。
 *
 * 可见性由服务端裁剪——非本组记录不下发 books 字段，
 * 前端不做过滤，避免明细泄漏到网络响应里。
 */
export function TileDetailDialog({
  tileIndex,
  onClose,
}: {
  tileIndex: number
  onClose: () => void
}) {
  const fallbackTile = useTile(tileIndex)
  // 队伍形象：按 teamId 从棋盘快照里取，未配置时组件内部回退
  const teams = useActivityStore((s) => s.teams)
  const [detail, setDetail] = useState<TileDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchTileDetail(tileIndex)
      .then((d) => {
        if (alive) setDetail(d)
      })
      .catch(() => {
        if (alive) setDetail(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [tileIndex])

  // 服务端下发的判定规则是平铺字段，这里补齐成组件消费的嵌套结构
  const tile = useMemo(() => {
    if (!detail) return fallbackTile
    const t = detail.tile
    return {
      index: t.index,
      title: t.title,
      taskType: t.taskType,
      target: t.target,
      unit: t.unit,
      specialRule: t.specialRule
        ? { kind: t.specialRule, label: t.specialRuleLabel ?? RULES[t.specialRule].label }
        : undefined,
    }
  }, [detail, fallbackTile])

  const records: TileRecord[] = detail?.records ?? []

  // 本组记录按轮次倒序展示，跨轮次落入同格时分轮分组（PRD 8.2）
  const ownRecords = useMemo(
    () => records.filter((r) => r.isMyTeam).sort((a, b) => b.lap - a.lap),
    [records],
  )

  if (!tile) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tile-detail-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] p-5 shadow-[6px_6px_0_#292524] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-emerald-700">第 {tile.index} 格 · {TASK_TYPE_LABEL[tile.taskType]}</p>
            <h2 id="tile-detail-title" className="mt-1 text-lg font-black text-stone-900">
              {tile.title}
            </h2>
            <p className="mt-1 text-xs font-medium text-stone-500">
              目标 {formatTileTarget(tile)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            <X className="size-4" />
          </button>
        </div>

        {tile.specialRule && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">
            <Dices aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            特殊判定：{tile.specialRule.label}
          </p>
        )}

        {tile.taskType === 'timed-penalty' && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
            <Hourglass aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            惩罚格：掷骰落入即启动 72 小时计时，期间无法打卡与掷骰，到期自动点亮。
          </p>
        )}

        {tile.taskType === 'group-cross' && (
          <p className="mt-3 rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-medium text-stone-600">
            本格书库来源为活动页内本月已通过审核的全部打卡书目，可在提交表单中搜索选书。
          </p>
        )}

        <section aria-labelledby="tile-teams-heading" className="mt-5">
          <h3 id="tile-teams-heading" className="text-sm font-medium text-stone-800">
            已打卡小组
          </h3>
          {loading ? (
            <Loader2 aria-label="加载中" className="mt-2 size-4 animate-spin text-stone-400" />
          ) : records.length === 0 ? (
            <p className="mt-2 text-xs font-bold text-emerald-700">暂无小组在该格打卡。</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {records.map((row) => (
                <li
                  key={`${row.teamId}-${row.lap}`}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs',
                    row.isMyTeam ? 'bg-sky-500/10' : 'bg-stone-50 border-stone-200',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 text-stone-800">
                    <TeamEmblem
                      emblem={teams.find((t) => t.id === row.teamId)?.emblem}
                      size={20}
                      className="shrink-0"
                    />
                    <span className="truncate font-bold">{row.teamName}</span>
                    <span className="shrink-0 text-[10px] text-stone-400">第 {row.lap} 轮</span>
                    {row.isMyTeam && <span className="text-[10px] text-sky-300">本组</span>}
                  </span>
                  <span className="shrink-0 text-stone-500">
                    已通过 {row.bookCount} 本
                    {row.lit && row.litReason && (
                      <span className="ml-2 text-amber-300">已点亮 · {LIT_LABEL[row.litReason]}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tile-books-heading" className="mt-5">
          <h3 id="tile-books-heading" className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
            本组书目清单
            <Lock aria-hidden className="size-3 text-stone-400" />
            <span className="text-[11px] font-normal text-stone-400">仅本组成员可见</span>
          </h3>
          {ownRecords.every((r) => !r.books?.length) ? (
            <p className="mt-2 text-xs font-bold text-emerald-700">本组在该格暂无打卡记录。</p>
          ) : (
            ownRecords.map((record) => (
              <div key={`${record.teamId}-${record.lap}`} className="mt-3">
                <p className="text-[11px] text-stone-400">第 {record.lap} 轮</p>
                <ul className="mt-1.5 space-y-1">
                  {(record.books ?? []).map((book) => (
                    <li
                      key={book.id}
                      className="flex items-start justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0">
                        <span className="text-stone-900">{book.title}</span>
                        <span className="ml-1.5 text-stone-400">{book.author}</span>
                        <span className="mt-0.5 block text-[11px] text-stone-400">
                          {book.memberName} · {formatWords(book.wordCount)}
                          {book.countsForTask ? ' · 计入任务进度' : ''}
                        </span>
                        {book.aiReason && (
                          <span className="mt-0.5 block text-[11px] text-stone-400">
                            AI 初审：{book.aiReason}
                          </span>
                        )}
                      </span>
                      <ReviewBadge status={book.reviewStatus} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
