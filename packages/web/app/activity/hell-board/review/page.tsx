import { AuthGate } from '../components/auth-gate'
import { ReviewConsoleView } from './review-console-view'

export const metadata = {
  title: '人工终审台 · 无限循环读书地狱',
}

/**
 * 人工终审台（PRD 9.3）。
 * 接口层已限制仅 admin / moderator 可访问，非授权用户会收到 403 提示。
 * 页面层再包一道 AuthGate（未登录跳登录页）+ 前端角色拦截（无权限只读提示），
 * 避免非授权用户看到页面外壳甚至发出无效请求。
 */
export default function ReviewConsolePage() {
  return (
    <AuthGate>
      <ReviewConsoleView />
    </AuthGate>
  )
}
