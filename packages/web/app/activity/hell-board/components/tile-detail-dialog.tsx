'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ClipboardList,
  Dices,
  Hourglass,
  Library,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { RULES, TASK_TYPE_LABEL } from '../lib/board'
import { fetchBookLibrary, fetchTileDetail } from '../lib/api'
import { formatTileTarget, formatWords } from '../lib/rules'
import { useActivityStore, useTile } from '../lib/store'
import type {
  AdminCheckInTarget,
  BookLibraryItem,
  LitReason,
  TileDetail,
  TileRecord,
} from '../lib/types'
import { CheckInFormDialog } from './checkin-form-dialog'
import { ReviewBadge } from './review-badge'
import { TeamEmblem } from './team-emblem'

const LIT_LABEL: Record<LitReason, string> = {
  task: '任务达成',
  fallback: '保底完成',
  timer: '计时到期',
  manual: '人工修正',
  initial: '初始化补录',
}

/** 书库浏览上限：服务端按书名+作者去重后，一次取足够多，避免翻页 */
const LIBRARY_LIMIT = 200

/**
 * 第 20 格「看十二本群友本月打卡过的书」的候选书库浏览器。
 *
 * 书库 = 活动内本月已通过审核的全部打卡书目（服务端按书名+作者去重）。
 * 展开后默认列出全量，也可按书名/作者搜索；这里只做查看，选书仍在打卡表单里完成。
 */
function GroupCrossLibrary({ canView }: { canView: boolean }) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<BookLibraryItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 展开时拉全量，之后按关键词防抖搜索（关键词为空即回到全量）
  useEffect(() => {
    if (!open || !canView) return
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        setItems(await fetchBookLibrary(keyword.trim(), LIBRARY_LIMIT))
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '书库加载失败')
      } finally {
        setLoading(false)
      }
    }, keyword.trim() ? 250 : 0)
    return () => clearTimeout(timer)
  }, [open, canView, keyword])

  return (
    <section className="mt-3 rounded-md border border-stone-300 bg-stone-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-stone-700 transition-colors hover:bg-stone-100"
      >
        <Library aria-hidden className="size-3.5 shrink-0 text-emerald-700" />
        本格候选书库
        <span className="font-medium text-stone-500">群友本月已通过审核的打卡书目</span>
        <ChevronDown
          aria-hidden
          className={cn('ml-auto size-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-stone-200 px-3 py-2.5">
          {!canView ? (
            <p className="text-xs font-medium text-stone-500">
              书库仅对已入组成员开放，报名并加入小组后即可查看。
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-2.5 py-1.5">
                <Search aria-hidden className="size-3.5 shrink-0 text-stone-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索书名或作者，留空看全部"
                  className="min-w-0 flex-1 bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400"
                />
                {loading && <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-stone-400" />}
              </label>

              {error ? (
                <p role="alert" className="mt-2 text-xs font-bold text-rose-700">
                  {error}
                </p>
              ) : items === null ? (
                <p className="mt-2 text-xs text-stone-400">正在载入书库…</p>
              ) : items.length === 0 ? (
                <p className="mt-2 text-xs font-medium text-stone-500">
                  {keyword.trim() ? '没有匹配的书目。' : '书库还是空的，等群友的打卡通过审核后就会出现。'}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-[11px] font-bold text-stone-500">
                    共 {items.length} 本可选
                    {items.length >= LIBRARY_LIMIT && '（仅显示最新 200 本，可用搜索缩小范围）'}
                  </p>
                  <ul className="mt-1.5 max-h-64 space-y-1 overflow-y-auto">
                    {items.map((book) => (
                      <li
                        key={book.id}
                        className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-bold text-stone-900">{book.title}</span>
                        {book.author && <span className="ml-1.5 text-stone-400">{book.author}</span>}
                        <span className="mt-0.5 block text-[11px] text-stone-400">
                          {book.teamName ? `${book.teamName} · ` : ''}
                          {book.memberName}
                          {book.wordCount > 0 ? ` · ${formatWords(book.wordCount)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * 格子打卡记录（PRD 8.2 / 验收标准 11）：
 * 所有登录用户可见已打卡小组汇总与各队书目清单。
 *
 * 这是共享型读书活动，跨队书单公开可见，群友可以互相看别队读了什么书。
 * 审核态差异由服务端裁剪：本队含待审 / 被驳回，其他队只下发已通过的。
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
  const tiles = useActivityStore((s) => s.tiles)
  const archived = useActivityStore((s) => s.archived)
  // 书库接口要求入组成员身份，观战用户只提示不请求
  const myMemberId = useActivityStore((s) => s.myMemberId)
  // 管理员补卡：格子详情「补卡」按钮对管理员开放选择打卡人
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin' || role === 'moderator'
  // 参与人列表：全部已入队成员及其队伍当前格（管理员补卡选择用）
  const adminTargets = useMemo<AdminCheckInTarget[]>(() => {
    if (!isAdmin) return []
    const out: AdminCheckInTarget[] = []
    for (const team of teams) {
      for (const m of team.members ?? []) {
        out.push({
          memberId: m.id,
          name: m.name,
          teamId: team.id,
          teamName: team.name,
          position: team.position,
        })
      }
    }
    return out
  }, [isAdmin, teams])
  const [detail, setDetail] = useState<TileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  // 本组已点亮格的补卡表单；reloadKey 用于补卡提交后刷新本格记录
  const [showCheckInForm, setShowCheckInForm] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

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
  }, [tileIndex, reloadKey])

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

  // 书单记录：共享活动下跨队公开，本队优先、其次按轮次倒序（PRD 8.2）
  const bookRecords = useMemo(
    () =>
      records
        .filter((r) => r.books?.length)
        .sort((a, b) => {
          if (a.isMyTeam !== b.isMyTeam) return a.isMyTeam ? -1 : 1
          return b.lap - a.lap
        }),
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

        {tile.taskType === 'group-cross' && <GroupCrossLibrary canView={Boolean(myMemberId)} />}

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
                    {/* 本组已点亮格支持补卡：补录线下已完成的打卡；
                        管理员对任意队伍已点亮格都可补卡（补卡人可选） */}
                    {row.lit &&
                      tile.taskType !== 'timed-penalty' &&
                      !archived &&
                      (row.isMyTeam || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => setShowCheckInForm(true)}
                          className="ml-2 inline-flex h-6 shrink-0 items-center gap-1 rounded-md border-2 border-[#8b6b2c] bg-[#fff8e5] px-1.5 text-[10px] font-bold text-[#7a5c1e] transition-colors hover:bg-[#fff3d6]"
                        >
                          <ClipboardList className="size-3" />
                          补卡
                        </button>
                      )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tile-books-heading" className="mt-5">
          <h3 id="tile-books-heading" className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
            本格书目清单
            <Library aria-hidden className="size-3 text-emerald-600" />
            <span className="text-[11px] font-normal text-stone-400">全场公开 · 可互相参考选书</span>
          </h3>
          {bookRecords.length === 0 ? (
            <p className="mt-2 text-xs font-bold text-emerald-700">该格暂无打卡记录。</p>
          ) : (
            bookRecords.map((record) => (
              <div key={`${record.teamId}-${record.lap}`} className="mt-3">
                <p className="flex items-center gap-1.5 text-[11px] text-stone-400">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full border border-stone-400/60"
                    style={{ backgroundColor: record.teamColor }}
                  />
                  <span className="font-bold text-stone-600">{record.teamName}</span>
                  {record.isMyTeam && <span className="text-[10px] font-black text-sky-600">本组</span>}
                  <span>· 第 {record.lap} 轮</span>
                </p>
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

      {showCheckInForm && (
        <CheckInFormDialog
          tileIndex={tileIndex}
          adminMode={isAdmin}
          adminTargets={isAdmin ? adminTargets : undefined}
          adminTiles={isAdmin ? tiles : undefined}
          lockTileIndex
          onClose={() => {
            setShowCheckInForm(false)
            // 补卡提交后刷新本格记录
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
