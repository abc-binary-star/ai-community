'use client'

import { BookHeart, Loader2 } from 'lucide-react'

/** 地图加载骨架屏：保持页面结构稳定，避免加载完成后布局跳变 */
export function MapSkeleton() {
  return (
    <div className="animate-pulse">
      {/* 页头骨架 */}
      <div className="mb-4 border-b-2 border-stone-200 pb-3">
        <div className="flex items-center gap-3">
          <div className="hidden size-11 rounded-lg bg-stone-200 sm:block" />
          <div className="flex-1">
            <div className="h-5 w-56 rounded bg-stone-200" />
            <div className="mt-2 h-3 w-72 rounded bg-stone-200" />
          </div>
        </div>
      </div>

      {/* Tab 骨架 */}
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg border-2 border-stone-200 bg-white p-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 rounded-md bg-stone-100" />
        ))}
      </div>

      {/* 地图区域骨架 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex h-[calc(100dvh-13.5rem)] min-h-[360px] items-center justify-center rounded-2xl border-[3px] border-stone-200 bg-[#d4e5e0] lg:h-[calc(100dvh-9.5rem)]">
          <div className="flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="size-7 animate-spin" />
            <p className="text-xs font-bold tracking-[0.18em]">正在铺开彩虹大富翁地图</p>
          </div>
        </div>

        {/* 右侧栏骨架 */}
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2.5">
              <div className="size-11 rounded-full bg-stone-200" />
              <div className="flex-1">
                <div className="h-4 w-24 rounded bg-stone-200" />
                <div className="mt-2 h-3 w-32 rounded bg-stone-200" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="h-14 rounded-md bg-stone-100" />
              <div className="h-14 rounded-md bg-stone-100" />
            </div>
          </div>
          <div className="rounded-lg border-2 border-stone-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-stone-200" />
            <div className="mt-3 h-10 rounded-md bg-stone-100" />
          </div>
        </div>
      </div>
    </div>
  )
}
