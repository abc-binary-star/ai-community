'use client'

import { Component, ErrorInfo, useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { captureError, track, EditorEvents } from '@/lib/analytics'

class EditorErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMessage?: string }
> {
  state: { hasError: boolean; errorMessage?: string } = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      component: 'EditorErrorBoundary',
      extra: { componentStack: info.componentStack ?? '' },
    })
    track(EditorEvents.EditorError, {
      source: 'error-boundary',
      message: error.message,
      componentStack: info.componentStack ?? '',
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm">
          <div className="text-base font-semibold text-destructive">编辑器遇到问题已自动隔离</div>
          <div className="text-muted-foreground">
            页面其他功能仍可用。请刷新页面重试；如果多次出现，请切换到 Markdown 模式保存草稿。
          </div>
          {this.state.errorMessage ? (
            <div className="mt-1 w-full rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground break-all">
              {this.state.errorMessage}
            </div>
          ) : null}
        </div>
      )
    }
    return this.props.children
  }
}

function GlobalErrorMonitor({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onError: OnErrorEventHandler = (eventOrMessage, source, lineno, colno, error) => {
      const message = eventOrMessage instanceof ErrorEvent ? eventOrMessage.message : String(eventOrMessage ?? '')
      const src = typeof source === 'string' ? source : undefined
      const line = typeof lineno === 'number' ? lineno : undefined
      const col = typeof colno === 'number' ? colno : undefined
      const err = error instanceof Error
        ? error
        : new Error(message || 'window.onerror')
      captureError(err, {
        component: 'window.onerror',
        extra: { source: src, line, col },
      })
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const err = reason instanceof Error ? reason : new Error(String(reason ?? 'unhandledrejection'))
      captureError(err, {
        component: 'window.unhandledrejection',
        extra: { reasonType: Object.prototype.toString.call(reason) },
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30 * 1000,
          },
        },
      }),
  )
  return (
    <GlobalErrorMonitor>
      <QueryClientProvider client={client}>
        <EditorErrorBoundary>
          {children}
        </EditorErrorBoundary>
      </QueryClientProvider>
    </GlobalErrorMonitor>
  )
}
