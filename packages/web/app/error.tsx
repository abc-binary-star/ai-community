'use client'

import { useEffect } from 'react'
import { captureError } from '@/lib/analytics'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    captureError(error, { component: 'app/error' })
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm">
      <div className="text-base font-semibold text-destructive">页面遇到了一些问题</div>
      <div className="text-muted-foreground">抱歉，页面渲染出错了。你可以重试或重新加载页面。</div>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        重试
      </button>
    </div>
  )
}
