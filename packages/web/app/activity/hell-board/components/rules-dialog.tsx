'use client'

import { BookHeart, Dices, Flag, Sparkles, Zap } from 'lucide-react'
import { KIND_META } from '../lib/board'
import { Dialog, DialogCloseButton } from './dialog'

const TILE_ORDER = ['forward', 'backward', 'special', 'swap', 'blank'] as const

const TILE_COLORS: Record<string, string> = {
  forward: 'from-[#eefbea] to-[#a9d9a6] border-[#4e8d58]',
  backward: 'from-[#fff0eb] to-[#efaaa0] border-[#ad5651]',
  special: 'from-[#fff8d6] to-[#efca64] border-[#ad7d2e]',
  swap: 'from-[#ecfaff] to-[#9fd4df] border-[#4f8899]',
  blank: 'from-[#fffdf7] to-[#ddd2bd] border-[#887763]',
}

/** 玩法说明弹窗：规则概览 + 格子类型图例 */
export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-md" labelledBy="rules-title">
      <div className="flex items-center gap-2 border-b-2 border-stone-800 bg-gradient-to-r from-[#fff1c2] to-[#ffd166] px-4 py-3">
        <BookHeart className="size-4 text-amber-700" />
        <p id="rules-title" className="text-sm font-black text-[#4a3306]">玩法说明</p>
        <DialogCloseButton onClose={onClose} />
      </div>

      <div className="max-h-[65dvh] overflow-y-auto px-4 py-4">
        {/* 核心流程 */}
        <div className="space-y-2.5">
          <div className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-black text-rose-700">1</span>
            <p className="text-[12px] leading-relaxed text-stone-700">在群里读书打卡，系统自动记录阅读条数。</p>
          </div>
          <div className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-black text-amber-700">2</span>
            <p className="text-[12px] leading-relaxed text-stone-700">集齐红橙黄绿青蓝紫 7 色彩虹（每色对应一名队员的阅读），队长登记后获得 <strong>1 次掷骰机会</strong>。</p>
          </div>
          <div className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-700">3</span>
            <p className="text-[12px] leading-relaxed text-stone-700">在群里掷骰子，队长在本页录入点数，队伍沿 100 格路线前进并结算格子效果。</p>
          </div>
          <div className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-black text-violet-700">4</span>
            <p className="text-[12px] leading-relaxed text-stone-700">团队积分每满 10 分自动兑换 <strong>1 枚万能骰子</strong>，可无视格子效果前进。</p>
          </div>
          <div className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-black text-sky-700">5</span>
            <p className="text-[12px] leading-relaxed text-stone-700">率先走完 100 格冲线的队伍夺冠 <Flag className="inline size-3 text-amber-500" /></p>
          </div>
        </div>

        {/* 格子图例 */}
        <div className="mt-4 border-t-2 border-dashed border-[#dccfa8] pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-black text-[#6b4e15]">
            <Sparkles className="size-3.5 text-amber-600" />
            格子类型
          </p>
          <div className="mt-2 space-y-1.5">
            {TILE_ORDER.map((kind) => {
              const meta = KIND_META[kind]
              return (
                <div key={kind} className="flex items-center gap-2">
                  <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md border-2 bg-gradient-to-b text-[10px] font-black text-[#4d4035] ${TILE_COLORS[kind]}`}>
                    {meta.short}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[11px] font-black text-stone-800">{meta.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 rounded-md bg-stone-50 px-2 py-1.5 text-[10px] leading-relaxed text-stone-500">
            点击地图上任意格子可查看该格的具体效果。特殊功能格有 20+ 种随机事件，包括积分暴击、步数翻倍、全队加速、道具掉落等。
          </p>
        </div>

        {/* 操作提示 */}
        <div className="mt-3 border-t-2 border-dashed border-[#dccfa8] pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-black text-[#6b4e15]">
            <Dices className="size-3.5 text-amber-600" />
            地图操作
          </p>
          <ul className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-stone-600">
            <li>· 拖拽平移地图，滚轮/双指缩放，双击聚焦格子</li>
            <li>· 右下角缩略图可快速跳转，左下角工具条可回到本队</li>
            <li>· 队长在右侧面板录入骰子点数，<Zap className="inline size-2.5 text-violet-500" /> 万能骰子无视格子效果</li>
          </ul>
        </div>
      </div>

      <div className="border-t-2 border-stone-800 px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-md border-2 border-stone-800 bg-[#ffd166] py-2 text-[12px] font-black text-[#4a3306] shadow-[2px_2px_0_#292524] transition-transform hover:-translate-y-0.5 active:translate-x-px active:translate-y-px active:shadow-none"
        >
          知道了
        </button>
      </div>
    </Dialog>
  )
}
