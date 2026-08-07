'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BookOpen, Eye, EyeOff, Gavel, Loader2, LogOut, Sparkles, Users } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AllTeamsPanel } from './components/all-teams-panel'
import { BoardGrid } from './components/board-grid'
import { BoardTextView } from './components/board-text-view'
import { CheckInFormDialog } from './components/checkin-form-dialog'
import { CurrentTaskPanel } from './components/current-task-panel'
import { EnrollWizard } from './components/enroll-wizard'
import { MyCheckInsPanel } from './components/my-checkins-panel'
import { RankingPanel } from './components/ranking-panel'
import { TeamPanel } from './components/team-panel'
import { TileDetailDialog } from './components/tile-detail-dialog'
import { VotePoolPanel } from './components/vote-pool-panel'
import { useActivityStore, useCurrentTeam, useIsCaptain } from './lib/store'

const POLL_INTERVAL_MS = 10_000

/** 侧边栏五个标签页 */
const SIDE_TABS = [
  ['team', '队伍'],
  ['ranking', '榜单'],
  ['mine', '我的打卡'],
  ['pool', '审核池'],
  ['teams', '全部队伍'],
] as const

type SideTab = (typeof SIDE_TABS)[number][0]

export function HellBoardView() {
  const teams = useActivityStore((s) => s.teams)
  const selectedTile = useActivityStore((s) => s.selectedTile)
  const selectTile = useActivityStore((s) => s.selectTile)
  const loading = useActivityStore((s) => s.loading)
  const error = useActivityStore((s) => s.error)
  const archived = useActivityStore((s) => s.archived)
  const myMemberId = useActivityStore((s) => s.myMemberId)
  const enrolled = useActivityStore((s) => s.enrolled)
  const loadAll = useActivityStore((s) => s.loadAll)
  const refresh = useActivityStore((s) => s.refresh)

  const currentTeam = useCurrentTeam()
  const isCaptain = useIsCaptain()
  const role = useAuthStore((s) => s.user?.role)
  const canReview = role === 'admin' || role === 'moderator'
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [showTextView, setShowTextView] = useState(false)
  const [showCheckInForm, setShowCheckInForm] = useState(false)
  const [sideTab, setSideTab] = useState<SideTab>('team')

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (archived) return
    const timer = setInterval(() => {
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [archived, refresh])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6ed]">
        <div className="flex flex-col items-center gap-3 text-emerald-800">
          <Loader2 className="size-7 animate-spin" />
          <p className="text-xs font-bold tracking-[0.18em]">正在摆好棋盘</p>
        </div>
      </div>
    )
  }

  if (!teams.length) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f7f6ed] px-6 text-center text-stone-800">
        <div className="flex size-14 items-center justify-center rounded-lg border-2 border-stone-800 bg-[#ffd166] shadow-[4px_4px_0_#292524]">
          <BookOpen className="size-6" />
        </div>
        <p className="max-w-md text-sm font-medium">
          {error ?? '活动还没有配置小组，请等待运营完成名单录入'}
        </p>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="rounded-md border-2 border-stone-800 bg-white px-4 py-2 text-xs font-bold shadow-[3px_3px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          重新加载
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f6ed] text-stone-900 [background-image:radial-gradient(#d6d3c5_0.8px,transparent_0.8px)] [background-size:18px_18px]">
      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-5 lg:px-7 lg:py-4">
        <header className="mb-4 border-b-2 border-stone-800 pb-3 lg:mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden size-10 shrink-0 rotate-[-3deg] items-center justify-center rounded-lg border-2 border-stone-800 bg-[#ffd166] shadow-[4px_4px_0_#292524] sm:flex">
                <BookOpen className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-black text-stone-900 sm:text-xl lg:text-2xl">无限循环读书地狱</h1>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-stone-600 lg:text-sm">
                  <span className="inline-flex items-center gap-1"><Sparkles className="size-3.5 text-amber-600" />推理小说群月度活动</span>
                  {archived && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">已结束 · 只读归档</span>}
                  {!currentTeam && <span className="rounded bg-stone-200 px-1.5 py-0.5 font-bold text-stone-600">观战中</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canReview && (
                <Link
                  href="/activity/hell-board/review"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                >
                  <Gavel className="size-3.5" />
                  终审台
                </Link>
              )}
              <button
                type="button"
                onClick={() => setShowTextView((v) => !v)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
                  showTextView ? 'bg-[#78c6a3]' : 'bg-white hover:bg-[#fff4cf]',
                )}
                aria-pressed={showTextView}
              >
                {showTextView ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                <span className="hidden sm:inline">文本视图</span>
              </button>
              <button
                type="button"
                onClick={clearAuth}
                title="退出登录"
                aria-label="退出登录"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:text-rose-600 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">退出</span>
              </button>
            </div>
          </div>
        </header>

        {/* xl 下棋盘在左、右栏独立成列：右栏吸顶且高度限制在视口内，
            面板区因此始终有界，内容多时（10 队 / 审核池多本书）在面板内部滚动，
            不会再撑高整页导致溢出 */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_370px] xl:gap-5">
          <div className="min-w-0">
            {showTextView ? (
              <BoardTextView teams={teams} currentTeam={currentTeam} />
            ) : (
              <div className="mx-auto max-w-[430px] rounded-lg border-2 border-stone-800 bg-[#dff3e7] p-2 shadow-[5px_5px_0_#292524] md:max-w-none md:p-3">
                <BoardGrid teams={teams} currentTeam={currentTeam} onSelectTile={selectTile} />
              </div>
            )}
          </div>

          {/* 右栏承载打卡主链路：任务进度与打卡入口置顶，队伍/榜单收进切换栏，
              使电脑端与棋盘同屏，打卡无需滚动。高度 = 视口减去顶部页头与边距，
              超出部分由面板自身滚动 */}
          <aside className="space-y-3 xl:sticky xl:top-4 xl:flex xl:h-[calc(100dvh-6rem)] xl:flex-col">
            <div className="xl:shrink-0">
              {currentTeam ? (
                <CurrentTaskPanel
                  team={currentTeam}
                  isCaptain={isCaptain}
                  readOnly={archived}
                  onOpenCheckIn={() => setShowCheckInForm(true)}
                />
              ) : (
                <div className="rounded-lg border-2 border-stone-800 bg-white p-4 shadow-[4px_4px_0_#292524]">
                  <p className="flex items-center gap-2 text-sm font-black"><Users className="size-4 text-emerald-700" />观战模式</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
                    {enrolled
                      ? '你已报名，等待选择小组加入后即可打卡与掷骰。'
                      : '你已登录，但不在本次活动的任何小组中。报名并选择小组后即可参与。'}
                  </p>
                  {!archived && <EnrollWizard />}
                </div>
              )}
            </div>

            <div
              role="tablist"
              aria-label="侧边栏切换"
              className="grid shrink-0 grid-cols-5 gap-1 rounded-lg border-2 border-stone-800 bg-white p-1 shadow-[3px_3px_0_#292524]"
            >
              {SIDE_TABS.map(([key, label]) => (
                <button
                  key={key}
                  id={`side-tab-${key}`}
                  role="tab"
                  type="button"
                  aria-selected={sideTab === key}
                  aria-controls={`side-panel-${key}`}
                  onClick={() => setSideTab(key)}
                  className={cn(
                    'rounded px-1 py-2 text-xs font-bold transition-colors',
                    sideTab === key
                      ? 'bg-[#ffd166] text-stone-900'
                      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 面板区占满右栏剩余高度（min-h-0 允许收缩到有界高度），
                内容超长时由各面板内部的 flex-1 + overflow-y-auto 滚动。
                此处不设 overflow：否则会裁掉卡片 4px 硬阴影，且 overflow-x 会被迫变成 auto */}
            <div className="xl:min-h-0 xl:flex-1">
              <div
                id="side-panel-team"
                role="tabpanel"
                aria-labelledby="side-tab-team"
                hidden={sideTab !== 'team'}
                className="xl:h-full"
              >
                {currentTeam ? (
                  <TeamPanel team={currentTeam} currentMemberId={myMemberId ?? ''} />
                ) : (
                  <p className="rounded-lg border-2 border-stone-800 bg-white p-4 text-xs text-stone-600 shadow-[3px_3px_0_#292524] xl:h-full">
                    你不在本次活动的小组中，可查看棋盘与榜单
                  </p>
                )}
              </div>
              <div
                id="side-panel-ranking"
                role="tabpanel"
                aria-labelledby="side-tab-ranking"
                hidden={sideTab !== 'ranking'}
                className="xl:h-full"
              >
                <RankingPanel />
              </div>
              <div
                id="side-panel-mine"
                role="tabpanel"
                aria-labelledby="side-tab-mine"
                hidden={sideTab !== 'mine'}
                className="xl:h-full"
              >
                <MyCheckInsPanel />
              </div>
              <div
                id="side-panel-pool"
                role="tabpanel"
                aria-labelledby="side-tab-pool"
                hidden={sideTab !== 'pool'}
                className="xl:h-full"
              >
                <VotePoolPanel />
              </div>
              <div
                id="side-panel-teams"
                role="tabpanel"
                aria-labelledby="side-tab-teams"
                hidden={sideTab !== 'teams'}
                className="xl:h-full"
              >
                <AllTeamsPanel />
              </div>
            </div>
          </aside>
        </div>
      </div>

      {selectedTile !== null && (
        <TileDetailDialog tileIndex={selectedTile} onClose={() => selectTile(null)} />
      )}

      {showCheckInForm && currentTeam && (
        <CheckInFormDialog
          tileIndex={currentTeam.position}
          onClose={() => setShowCheckInForm(false)}
        />
      )}

      {error && teams.length > 0 && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border-2 border-stone-900 bg-[#ff7b6b] px-4 py-2 text-xs font-bold text-white shadow-[4px_4px_0_#292524]"
        >
          {error}
        </div>
      )}
    </div>
  )
}
