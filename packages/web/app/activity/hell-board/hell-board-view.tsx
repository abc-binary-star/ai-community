'use client'

import { useEffect, useState } from 'react'
import { BookHeart, CircleHelp, LogOut, Map as MapIcon, PartyPopper, Rainbow, RefreshCw, Settings2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { BigEventsPanel } from './components/big-events'
import { BoardMap } from './components/board-map'
import { EnrollWizard } from './components/enroll-wizard'
import { MapSkeleton } from './components/map-skeleton'
import { MyTeamDialog } from './components/my-team-dialog'
import { RainbowBridgeDialog } from './components/rainbow-bridge-dialog'
import { RainbowPanel } from './components/rainbow-panel'
import { RollResultDialog } from './components/roll-result-dialog'
import { RulesDialog } from './components/rules-dialog'
import { TeamsOverview } from './components/teams-overview'
import { TileInfoDialog } from './components/tile-info-dialog'
import { TimelineDialog } from './components/timeline-dialog'
import { ToastHost } from './components/toast'
import { useActivityStore, useCurrentTeam, useIsCaptain } from './lib/store'

const POLL_INTERVAL_MS = 10_000

type TopView = 'board' | 'events' | 'teams'

function formatTime(d: Date) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * 「九月彩虹桥 · 读书大富翁」活动主页面。
 * 读书/打卡/投骰在群内完成，这里展示大富翁大地图与每队当前格子 + buff/debuff，
 * 队长录入骰子点数后由服务端程序化结算。
 */
export function HellBoardView() {
  const teams = useActivityStore((s) => s.teams)
  const loading = useActivityStore((s) => s.loading)
  const error = useActivityStore((s) => s.error)
  const archived = useActivityStore((s) => s.archived)
  const enrolled = useActivityStore((s) => s.enrolled)
  const selectedTile = useActivityStore((s) => s.selectedTile)
  const selectTile = useActivityStore((s) => s.selectTile)
  const lastOutcome = useActivityStore((s) => s.lastOutcome)
  const closeOutcome = useActivityStore((s) => s.closeOutcome)
  const clearError = useActivityStore((s) => s.clearError)
  const loadAll = useActivityStore((s) => s.loadAll)
  const refresh = useActivityStore((s) => s.refresh)

  const currentTeam = useCurrentTeam()
  const isCaptain = useIsCaptain()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const [topView, setTopView] = useState<TopView>('board')
  const [showTimeline, setShowTimeline] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showMine, setShowMine] = useState(false)
  const [showBridge, setShowBridge] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void loadAll().then(() => setLastUpdated(new Date()))
  }, [loadAll])

  useEffect(() => {
    if (archived) return
    const tick = () => {
      // 后台标签页暂停轮询，省流量省电
      if (document.hidden) return
      void refresh().then((ok) => { if (ok) setLastUpdated(new Date()) })
    }
    const timer = setInterval(tick, POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [archived, refresh])

  const manualRefresh = async () => {
    setRefreshing(true)
    const ok = await refresh()
    setLastUpdated(new Date())
    setRefreshing(false)
    if (!ok) {
      // error already set in store
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f6ed] [background-image:radial-gradient(#d6d3c5_0.8px,transparent_0.8px)] [background-size:18px_18px]">
        <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-5 lg:px-7">
          <MapSkeleton />
        </div>
      </div>
    )
  }

  if (!teams.length) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f7f6ed] px-6 text-center text-stone-800">
        <div className="flex size-14 items-center justify-center rounded-lg border-2 border-stone-800 bg-[#ffd166] shadow-[4px_4px_0_#292524]">
          <BookHeart className="size-6" />
        </div>
        <p className="max-w-md text-sm font-medium">{error ?? '活动还没有配置队伍，请等待运营完成名单录入'}</p>
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
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f7f6ed] text-stone-900 [background-image:radial-gradient(#d6d3c5_0.8px,transparent_0.8px)] [background-size:18px_18px]">
      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-5 lg:px-7">
        {/* 归档横幅 */}
        {archived && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            <span aria-hidden className="size-2 rounded-full bg-amber-500" />
            活动已结束，当前为只读归档数据
          </div>
        )}

        {/* 页头 */}
        <header className="mb-4 border-b-2 border-stone-800 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden size-11 shrink-0 rotate-[-3deg] items-center justify-center rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fff1c2] to-[#ffd166] shadow-[4px_4px_0_#292524] sm:flex">
                <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'conic-gradient(from 90deg, #e11d48,#f97316,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#e11d48)' }} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-black text-stone-900 sm:text-xl lg:text-2xl">九月彩虹桥 · 读书大富翁</h1>
                  {archived && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">已结束</span>}
                  {!currentTeam && <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">观战中</span>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-stone-600 lg:text-sm">
                  <span className="inline-flex items-center gap-1">
                    <BookHeart className="size-3.5 text-amber-600" />
                    群里读书香色 · 集齐 7 色投骰 · 走完 100 格夺冠军
                  </span>
                </p>
              </div>
            </div>

            <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
              {/* 刷新状态 */}
              <button
                type="button"
                onClick={() => void manualRefresh()}
                disabled={refreshing}
                title="手动刷新数据"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-2.5 text-[10px] font-bold text-stone-500 shadow-[2px_2px_0_#292524] transition-all hover:text-stone-800 active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-60"
              >
                <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                <span>刷新</span>
                {lastUpdated && (
                  <span className="hidden tabular-nums text-stone-400 sm:inline">{formatTime(lastUpdated)}</span>
                )}
              </button>
              {/* 我的队伍：改昵称 / 换彩虹色 / 退队 */}
              {(enrolled || !!currentTeam) && (
                <button
                  type="button"
                  onClick={() => setShowMine(true)}
                  title="修改昵称、换彩虹色或退出队伍"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:text-amber-700 active:translate-x-px active:translate-y-px active:shadow-none"
                >
                  <Settings2 className="size-3.5" />
                  <span>我的队伍</span>
                </button>
              )}
              {/* 玩法说明 */}
              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:text-amber-700 active:translate-x-px active:translate-y-px active:shadow-none"
              >
                <CircleHelp className="size-3.5" />
                <span>玩法</span>
              </button>
              <button
                type="button"
                onClick={clearAuth}
                title="退出登录"
                aria-label="退出登录"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold text-stone-600 shadow-[2px_2px_0_#292524] transition-all hover:text-rose-600 active:translate-x-px active:translate-y-px active:shadow-none"
              >
                <LogOut className="size-3.5" />
                <span>退出</span>
              </button>
            </div>
          </div>
        </header>

        {/* 顶部视图切换 */}
        <nav aria-label="页面视图切换" className="mb-4 grid grid-cols-3 gap-1 rounded-lg border-2 border-stone-800 bg-white p-1 shadow-[3px_3px_0_#292524]">
          {(
            [
              ['board', '棋盘', MapIcon],
              ['events', '大事件', PartyPopper],
              ['teams', '全部队伍', Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-current={topView === key ? 'page' : undefined}
              onClick={() => setTopView(key)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-bold transition-colors',
                topView === key ? 'bg-[#ffd166] text-stone-900' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>

        {topView === 'board' ? (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-5">
            {/* 大地图 */}
            <div className="min-w-0">
              <div className="h-[48vh] min-h-[300px] w-full xl:h-[calc(100dvh-9.5rem)]">
                <BoardMap onSelectTile={selectTile} />
              </div>
            </div>

            {/* 右侧栏 */}
            <aside className="space-y-3 xl:sticky xl:top-4 xl:flex xl:h-[calc(100dvh-9.5rem)] xl:flex-col">
              <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-0.5">
                {currentTeam ? (
                  <RainbowPanel
                    team={currentTeam}
                    isCaptain={isCaptain}
                    archived={archived}
                    onOpenTimeline={() => setShowTimeline(true)}
                  />
                ) : (
                  <div className="rounded-lg border-2 border-stone-800 bg-white p-4 shadow-[4px_4px_0_#292524]">
                    <p className="flex items-center gap-2 text-sm font-black">
                      <Users className="size-4 text-emerald-700" />
                      观战模式
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
                      {enrolled
                        ? '你已报名，选择小组并认领一个彩虹色后即可参与。'
                        : '你已登录，但不在本次活动的任何小组中，可先报名再入队。'}
                    </p>
                    <EnrollWizard />
                  </div>
                )}

                {/* 彩虹桥晒图入口 */}
                <button
                  type="button"
                  onClick={() => setShowBridge(true)}
                  className="mt-3 flex w-full items-center gap-2.5 rounded-lg border-2 border-stone-800 bg-white px-3 py-2.5 text-left shadow-[3px_3px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border-2 border-stone-800 bg-[#f4ecff]">
                    <Rainbow className="size-4 text-violet-700" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-stone-900">彩虹桥晒图</span>
                    <span className="block truncate text-[10px] font-medium text-stone-500">上传封面 · 自动排成七色桥</span>
                  </span>
                </button>
              </div>
            </aside>
          </div>
        ) : topView === 'events' ? (
          <div className="mx-auto w-full max-w-6xl">
            <BigEventsPanel />
          </div>
        ) : (
          <TeamsOverview teams={teams} myTeamId={currentTeam?.id ?? null} />
        )}
      </div>

      {selectedTile !== null && <TileInfoDialog index={selectedTile} onClose={() => selectTile(null)} />}
      {showTimeline && <TimelineDialog onClose={() => setShowTimeline(false)} />}
      {lastOutcome && <RollResultDialog outcome={lastOutcome} onClose={closeOutcome} />}
      {showRules && <RulesDialog open={showRules} onClose={() => setShowRules(false)} />}
      {showMine && <MyTeamDialog onClose={() => setShowMine(false)} />}
      {showBridge && <RainbowBridgeDialog onClose={() => setShowBridge(false)} />}

      <ToastHost />

      {error && teams.length > 0 && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border-2 border-stone-900 bg-[#ff7b6b] px-4 py-2 text-xs font-bold text-white shadow-[4px_4px_0_#292524]"
        >
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            aria-label="关闭错误提示"
            onClick={clearError}
            className="shrink-0 rounded p-0.5 hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
