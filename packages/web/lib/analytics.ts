'use client'

// 基础埋点（PRD §11 事件骨架）。
// 配置 NEXT_PUBLIC_TRACKING_URL 后以 POST 上报；未配置时仅在开发环境 console 输出。
const TRACKING_URL = process.env.NEXT_PUBLIC_TRACKING_URL

export function track(event: string, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  const payload = { event, props, url: window.location.href, ts: Date.now() }
  if (TRACKING_URL) {
    fetch(TRACKING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } else if (process.env.NODE_ENV !== 'production') {
    console.debug('[track]', event, props)
  }
}
