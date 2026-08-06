import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '无限循环读书地狱 · 月度活动',
  description: '推理小说群月度共读活动棋盘',
}

/**
 * 活动独立 layout（PRD 第 12 节「隔离要求落地」）：
 * 不引入社区导航组件，页面内无任何跳转到社区其他模块的入口。
 */
export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f7f6ed] text-stone-900">{children}</div>
}
