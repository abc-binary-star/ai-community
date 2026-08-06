import { ReviewConsoleView } from './review-console-view'

export const metadata = {
  title: '人工终审台 · 无限循环读书地狱',
}

/**
 * 人工终审台（PRD 9.3）。
 * 接口层已限制仅 admin / moderator 可访问，非授权用户会收到 403 提示。
 */
export default function ReviewConsolePage() {
  return <ReviewConsoleView />
}
