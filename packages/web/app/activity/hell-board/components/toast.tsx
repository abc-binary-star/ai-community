'use client'

import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActivityStore } from '../lib/store'

const TONE_META = {
  success: { icon: CheckCircle2, cls: 'border-emerald-600 bg-emerald-50 text-emerald-900', iconCls: 'text-emerald-600' },
  error: { icon: XCircle, cls: 'border-rose-600 bg-rose-50 text-rose-900', iconCls: 'text-rose-600' },
  info: { icon: Info, cls: 'border-amber-600 bg-amber-50 text-amber-900', iconCls: 'text-amber-600' },
} as const

/** Toast 通知宿主：固定在顶部居中，自动消失，可手动关闭 */
export function ToastHost() {
  const toasts = useActivityStore((s) => s.toasts)
  const dismiss = useActivityStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((toast) => {
        const meta = TONE_META[toast.tone]
        const Icon = meta.icon
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex max-w-[90vw] items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-bold shadow-[3px_3px_0_#292524] animate-[toast-in_0.2s_ease-out]',
              meta.cls,
            )}
          >
            <Icon className={cn('size-4 shrink-0', meta.iconCls)} />
            <span className="min-w-0">{toast.message}</span>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => dismiss(toast.id)}
              className="ml-1 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
