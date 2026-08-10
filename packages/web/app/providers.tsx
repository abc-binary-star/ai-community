'use client'

import { Component, ErrorInfo, useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { captureError } from '@/lib/analytics'

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMessage?: string }
> {
  state: { hasError: boolean; errorMessage?: string } = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      component: 'AppErrorBoundary',
      extra: { componentStack: info.componentStack ?? '' },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm">
          <div className="text-base font-semibold text-destructive">页面遇到了一些问题</div>
          <div className="text-muted-foreground">
            抱歉，页面渲染出错了。你可以重新加载页面重试；如果问题持续出现，请联系我们反馈。
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            重新加载
          </button>
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
        <AppErrorBoundary>
          {children}
        </AppErrorBoundary>
      </QueryClientProvider>
    </GlobalErrorMonitor>
  )
}
