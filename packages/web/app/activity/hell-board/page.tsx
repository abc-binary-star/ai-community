import { AuthGate } from './components/auth-gate'
import { HellBoardView } from './hell-board-view'

/**
 * 活动页「九月彩虹桥 · 读书大富翁」。
 * 独立路由段 + 独立 layout，与社区主站完全隔离。
 * 读书/打卡/投骰在群内完成，本页做棋盘可视化与程序化结算。
 */
export default function HellBoardPage() {
  return (
    <AuthGate>
      <HellBoardView />
    </AuthGate>
  )
}
