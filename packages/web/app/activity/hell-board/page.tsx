import { AuthGate } from './components/auth-gate'
import { HellBoardView } from './hell-board-view'

/**
 * 活动页「无限循环读书地狱」。
 * 独立路由段 + 独立 layout，与社区主站完全隔离，页面内无跳转到社区其他模块的入口
 * （PRD 第 12 节隔离要求 / 验收标准 9）。
 */
export default function HellBoardPage() {
  return (
    <AuthGate>
      <HellBoardView />
    </AuthGate>
  )
}
