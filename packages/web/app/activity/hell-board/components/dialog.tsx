'use client'

import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 通用弹窗：Esc 关闭、点击遮罩关闭、焦点陷阱、关闭后焦点归还。
 * 所有活动弹窗统一使用本组件，避免各弹窗重复实现。
 */
export function Dialog({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  labelledBy?: string
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleKeyDown, true)
    // 焦点移入弹窗
    const timer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      firstFocusable?.focus()
    }, 30)
    // 阻止背景滚动
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(timer)
      previouslyFocused.current?.focus?.()
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        ref={panelRef}
        className={cn(
          'relative w-full max-w-sm overflow-hidden rounded-lg border-2 border-stone-800 bg-gradient-to-b from-[#fffdf4] to-[#f6edd6] shadow-[5px_5px_0_#292524]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** 统一的弹窗关闭按钮 */
export function DialogCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="关闭"
      className="ml-auto rounded-md border border-stone-700 p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
    >
      <X className="size-3.5" />
    </button>
  )
}
