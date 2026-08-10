'use client'

export default function GlobalErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '60vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>应用遇到了一些问题</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>抱歉，应用初始化出错了，请重新加载页面。</div>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: 6,
              background: '#2563eb',
              color: '#fff',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
