import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '九月彩虹桥 · 读书大富翁',
  description: '推理小说群九月彩虹大富翁：集齐 7 色读书、掷骰走完 100 格',
}

/**
 * 活动独立 layout：不引入社区导航组件，页面内无跳转到社区其他模块的入口。
 */
export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f7f6ed] text-stone-900">{children}</div>
}
