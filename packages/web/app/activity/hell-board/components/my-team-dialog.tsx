'use client'

import { useState } from 'react'
import { AlertCircle, Check, Crown, Loader2, LogOut, Palette, Save, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RAINBOW, RAINBOW_ORDER } from '../lib/board'
import { canLeaveTeam, colorLabel, freeColorsForTeam } from '../lib/rules'
import { useActivityStore } from '../lib/store'
import { Dialog, DialogCloseButton } from './dialog'

/**
 * 「我的队伍」自助面板：改昵称、换彩虹色、退出队伍。
 * 后端三个接口均为随时可改（归档只读除外），放行的权威判定在服务端。
 */
export function MyTeamDialog({ onClose }: { onClose: () => void }) {
  const teams = useActivityStore((s) => s.teams)
  const archived = useActivityStore((s) => s.archived)
  const myTeamId = useActivityStore((s) => s.myTeamId)
  const myMemberId = useActivityStore((s) => s.myMemberId)
  const storeNickname = useActivityStore((s) => s.nickname)
  const isCaptain = useActivityStore((s) => s.isCaptain)
  const updateNickname = useActivityStore((s) => s.updateNickname)
  const claimColor = useActivityStore((s) => s.claimColor)
  const leaveTeam = useActivityStore((s) => s.leaveTeam)
  const pushToast = useActivityStore((s) => s.pushToast)
  const clearError = useActivityStore((s) => s.clearError)

  const team = teams.find((t) => t.id === myTeamId)
  const myColor = team?.members.find((m) => m.id === myMemberId)?.color ?? ''

  const [draft, setDraft] = useState(storeNickname)
  const [color, setColor] = useState(myColor)
  const [busy, setBusy] = useState<'' | 'nickname' | 'color' | 'leave'>('')
  const [err, setErr] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  const selectable = new Set<string>(freeColorsForTeam(team, myMemberId))
  const nicknameChanged = draft.trim() !== '' && draft.trim() !== storeNickname
  const colorChanged = !!color && color !== myColor && selectable.has(color)
  const leaveable = canLeaveTeam(team)

  async function run(kind: 'nickname' | 'color' | 'leave', fn: () => Promise<void>) {
    setBusy(kind)
    setErr('')
    try {
      await fn()
      // store 失败时同时写了全局 error，弹窗内已展示，避免两处重复提示
      clearError()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败，请稍后重试')
      clearError()
    } finally {
      setBusy('')
    }
  }

  return (
    <Dialog open onClose={onClose} className="max-w-md" labelledBy="my-team-title">
      <div className="flex items-center gap-2 border-b-2 border-stone-800 bg-gradient-to-r from-[#fff1c2] to-[#ffd166] px-4 py-3">
        <UserRound className="size-4 text-amber-700" />
        <p id="my-team-title" className="text-sm font-black text-[#4a3306]">我的队伍</p>
        <DialogCloseButton onClose={onClose} />
      </div>

      <div className="max-h-[68dvh] space-y-3.5 overflow-y-auto px-4 py-4">
        {archived && (
          <p className="rounded-md border-2 border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] font-bold text-amber-800">
            活动已结束，当前为只读归档态，昵称、彩虹色与队伍均不可调整。
          </p>
        )}

        {err && (
          <p role="alert" className="flex items-start gap-1.5 rounded-md border-2 border-rose-300 bg-rose-50 px-2.5 py-2 text-[11px] font-bold text-rose-700">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{err}</span>
          </p>
        )}

        {/* 昵称 */}
        <section>
          <p className="text-[11px] font-black text-[#6b4e15]">活动昵称</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
            展示在队伍名单与进度中，随时可改，改后立即生效。
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={50}
              disabled={archived || busy !== ''}
              placeholder="填写活动昵称"
              className="h-9 min-w-0 flex-1 rounded-md border-2 border-stone-700 bg-[#fbf6ea] px-2.5 text-sm outline-none focus:border-amber-600 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={!nicknameChanged || archived || busy !== ''}
              onClick={() =>
                void run('nickname', async () => {
                  const next = draft.trim()
                  await updateNickname(next)
                  pushToast({ message: '昵称已更新', tone: 'success' })
                })
              }
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border-2 border-stone-800 bg-[#22c55e] px-3 text-[11px] font-black text-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {busy === 'nickname' ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              保存
            </button>
          </div>
        </section>

        {/* 彩虹色 */}
        {team ? (
          <section className="border-t border-dashed border-[#c9b98f] pt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-black text-[#6b4e15]">
              <Palette className="size-3.5" />
              彩虹色 · 当前{colorLabel(myColor)}色
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
              一人一色，灰色为队友已占用。点击换色，随时可改。
            </p>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {RAINBOW_ORDER.map((c) => {
                const holder = team.members.find((m) => m.color === c && m.id !== myMemberId)
                const mine = c === myColor
                const disabled = !!holder || archived || busy !== ''
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={disabled}
                    onClick={() => setColor(c)}
                    title={holder ? `${RAINBOW[c].label}色：${holder.name}` : `${RAINBOW[c].label}色${mine ? '（当前）' : ''}`}
                    className={cn(
                      'relative inline-flex h-9 items-center justify-center rounded-full border-2 border-stone-800 text-[10px] font-black text-white shadow-[1px_1px_0_rgba(41,37,36,0.3)] transition-transform hover:-translate-y-0.5',
                      color === c && 'scale-110 ring-2 ring-amber-400 ring-offset-1',
                      disabled && 'cursor-not-allowed opacity-40 grayscale hover:translate-y-0',
                    )}
                    style={{ backgroundColor: RAINBOW[c].hex }}
                  >
                    {RAINBOW[c].label}
                    {mine && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-stone-800 bg-white text-[8px] font-black leading-none text-stone-800">
                        我
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              disabled={!colorChanged || archived || busy !== ''}
              onClick={() =>
                void run('color', async () => {
                  await claimColor(color)
                  pushToast({ message: `已换为${colorLabel(color)}色`, tone: 'success' })
                })
              }
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#ffd166] py-2 text-[12px] font-black text-[#4a3306] shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {busy === 'color' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {colorChanged ? `确认换为${colorLabel(color)}色` : '选择上方颜色后可换色'}
            </button>
          </section>
        ) : (
          <section className="border-t border-dashed border-[#c9b98f] pt-3">
            <p className="rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/70 px-2.5 py-2 text-[11px] leading-relaxed text-stone-600">
              你还没有加入队伍。回到页面右侧「选择队伍」入队后，即可在此换色与退队。
            </p>
          </section>
        )}

        {/* 退队 */}
        {team && !archived && (
          <section className="border-t border-dashed border-[#c9b98f] pt-3">
            <p className="text-[11px] font-black text-[#6b4e15]">退出「{team.name}」</p>
            {isCaptain && (
              <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
                你是队长，退队后队长位空缺，需由队友在页面内补选。
              </p>
            )}
            {leaveable ? (
              <>
                <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
                  本队尚未开始对战，可干净退出并重新选队。
                </p>
                {confirmLeave ? (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy !== ''}
                      onClick={() => setConfirmLeave(false)}
                      className="h-9 flex-1 rounded-md border-2 border-stone-300 bg-white text-[11px] font-bold text-stone-600 hover:border-amber-500 disabled:opacity-60"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={busy !== ''}
                      onClick={() =>
                        void run('leave', async () => {
                          await leaveTeam()
                          pushToast({ message: '已退出队伍，可重新选择小组', tone: 'success' })
                          onClose()
                        })
                      }
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border-2 border-stone-800 bg-[#ff7b6b] text-[11px] font-black text-white shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
                    >
                      {busy === 'leave' ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
                      确认退出
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => setConfirmLeave(true)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-stone-300 bg-white py-2 text-[11px] font-bold text-stone-600 hover:border-rose-400 hover:text-rose-700 disabled:opacity-60"
                  >
                    <LogOut className="size-3.5" />
                    退出队伍
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1 flex items-start gap-1.5 rounded-md border border-[#dccfa8] bg-[#f9f3e2]/70 px-2.5 py-2 text-[10px] leading-relaxed text-stone-500">
                <Crown className="mt-px size-3 shrink-0 text-amber-600" />
                <span>本队已开始对战（有掷骰 / 彩虹集齐 / 格子进展），不能自行退出。如需调整请联系管理员。</span>
              </p>
            )}
          </section>
        )}
      </div>
    </Dialog>
  )
}
