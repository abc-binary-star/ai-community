'use client'

import { Dices } from 'lucide-react'
import type { RollResult } from '../lib/types'
import { Dialog, DialogCloseButton } from './dialog'
import { Dice } from './dice'

/** 掷骰结算弹窗：程序跑完的每一步效果都会列在这里 */
export function RollResultDialog({ outcome, onClose }: { outcome: RollResult; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} labelledBy="roll-result-title">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b-2 border-stone-800 bg-gradient-to-r from-[#fff1c2] to-[#ffd166] px-4 py-2.5">
        <p id="roll-result-title" className="flex items-center gap-1.5 text-sm font-black text-[#4a3306]">
          <Dices className="size-4" />
          {outcome.value % 2 === 0 ? '掷出双数' : '掷出单数'} · 结算完成
        </p>
        <DialogCloseButton onClose={onClose} />
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center justify-center gap-4">
          <Dice value={outcome.value} size="md" />
          <div className="text-center">
            <p className="text-[26px] font-black tabular-nums leading-none text-stone-900">
              {outcome.fromTile} <span className="text-base text-stone-400">→</span> {outcome.toTile}
            </p>
            <p className="mt-1 text-[11px] font-bold text-stone-500">
              {outcome.moved >= 0 ? `前进 ${outcome.moved} 格` : `后退 ${-outcome.moved} 格`}
            </p>
          </div>
        </div>

        {/* 效果文案流 */}
        {outcome.results.length > 0 && (
          <ul className="mt-3.5 space-y-1 rounded-lg border-2 border-[#e5d9b8] bg-white/70 p-2.5">
            {outcome.results.map((r, i) => (
              <li
                key={`${r}-${i}`}
                className="flex items-start gap-1.5 text-[11px] font-medium leading-snug text-stone-700"
              >
                <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
                {r}
              </li>
            ))}
          </ul>
        )}

        {/* 积分与道具 */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
          <div className="rounded-md border border-[#dccfa8] bg-white/80 px-2 py-1.5">
            <p className="text-[9px] font-black text-stone-400">团队积分</p>
            <p className="text-[15px] font-black tabular-nums text-amber-700">
              {outcome.points >= 0 ? `+${outcome.points}` : outcome.points}
            </p>
          </div>
          <div className="rounded-md border border-[#dccfa8] bg-white/80 px-2 py-1.5">
            <p className="text-[9px] font-black text-stone-400">万能骰子</p>
            <p className="text-[15px] font-black tabular-nums text-violet-700">
              {outcome.diceExchanged > 0 ? `+${outcome.diceExchanged}（自动兑换）` : `持有 ${outcome.team.universalDice}`}
            </p>
          </div>
        </div>

        {outcome.won && (
          <div className="mt-3 rounded-lg border-2 border-amber-500 bg-gradient-to-r from-amber-5 to-yellow-100 px-3 py-2.5 text-center">
            <p className="text-sm font-black text-amber-900">🎉 冲线获胜！</p>
            <p className="mt-0.5 text-[11px] font-medium text-amber-800">
              「{outcome.team.name}」率先走完 100 格，成为《九月彩虹桥》总冠军
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3.5 w-full rounded-md border-2 border-stone-800 bg-[#ffd166] py-2 text-[12px] font-black text-[#4a3306] shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none"
        >
          知道了
        </button>
      </div>
    </Dialog>
  )
}
