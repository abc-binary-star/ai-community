'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 「导出打卡内容」弹窗：展示当前任务的群打卡文本，供成员核对后复制。
 *
 * 文本框内直接呈现完整内容，即使剪贴板权限不可用（非 HTTPS 环境下
 * navigator.clipboard 为 undefined），也能手动全选复制，不至于拿到空内容。
 */
export function ExportCheckInDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCopy = async () => {
    setFailed(false)
    // 优先用剪贴板 API；不可用时退回选中文本 + execCommand，最后才提示手动复制
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const area = areaRef.current
        if (!area) throw new Error('no textarea')
        area.focus()
        area.select()
        if (!document.execCommand('copy')) throw new Error('execCommand failed')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 复制通道全不可用：提示用户手动复制，并帮其选中全部文本
      setFailed(true)
      areaRef.current?.focus()
      areaRef.current?.select()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-checkin-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border-2 border-stone-800 bg-[#fffdf4] p-5 shadow-[6px_6px_0_#292524]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="export-checkin-title" className="flex items-center gap-2 text-sm font-black text-stone-900">
            <Download aria-hidden className="size-4 text-emerald-700" />
            导出打卡内容
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          当前格已通过审核的打卡书目与心得，可直接复制到群里。
        </p>

        <textarea
          ref={areaRef}
          readOnly
          value={text}
          rows={12}
          aria-label="打卡内容"
          className="mt-3 w-full resize-y rounded-md border-2 border-stone-800 bg-white p-2.5 font-mono text-xs leading-relaxed text-stone-800 shadow-[2px_2px_0_#292524] focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

        {failed && (
          <p
            role="alert"
            className="mt-2 rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
          >
            浏览器阻止了自动复制，文本已全选，请按 Cmd/Ctrl + C 手动复制。
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 px-3 text-xs font-black shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
              copied ? 'bg-[#78c6a3] text-stone-900' : 'bg-[#ffd166] text-stone-900 hover:bg-[#f5c34f]',
            )}
          >
            {copied ? (
              <>
                <Check aria-hidden className="size-3.5" />
                已复制
              </>
            ) : (
              <>
                <Copy aria-hidden className="size-3.5" />
                复制全部
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
