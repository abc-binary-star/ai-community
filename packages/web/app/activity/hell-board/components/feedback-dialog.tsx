'use client'

import { useState } from 'react'
import { Check, Loader2, MessageSquareWarning, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { submitFeedback } from '../lib/api'
import type { FeedbackType } from '../lib/types'

const TYPE_OPTIONS: Array<{ key: FeedbackType; label: string; desc: string }> = [
  { key: 'bug', label: 'Bug 反馈', desc: '遇到报错、数据异常等问题' },
  { key: 'feature', label: '需求建议', desc: '希望新增或调整的规则 / 功能' },
  { key: 'other', label: '其他', desc: '其他想对管理员说的话' },
]

/**
 * 反馈弹窗：用户在「我的」页面提交 bug / 需求。
 * 提交后进入管理员监督台（审批台）的待处理列表。
 */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>('bug')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const canSubmit = content.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await submitFeedback({
        type,
        content: content.trim(),
        contact: contact.trim() || undefined,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border-2 border-stone-800 bg-[#fffdf4] p-5 shadow-[6px_6px_0_#292524]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="feedback-title" className="flex items-center gap-2 text-sm font-black text-stone-900">
            <MessageSquareWarning aria-hidden className="size-4 text-emerald-700" />
            反馈
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

        {done ? (
          <div className="mt-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100">
              <Check aria-hidden className="size-6 text-emerald-700" />
            </div>
            <p className="mt-3 text-sm font-black text-stone-900">反馈已提交</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              管理员会在打卡监督台看到你的反馈，感谢支持。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 h-9 w-full rounded-md border-2 border-stone-800 bg-[#78c6a3] text-xs font-black text-stone-900 shadow-[2px_2px_0_#292524] transition-colors hover:bg-[#65b891]"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              遇到 bug 或有规则 / 功能上的建议，可以直接反馈给管理员。
            </p>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setType(opt.key)}
                  className={cn(
                    'rounded-md border-2 px-1 py-2 text-center transition-colors',
                    type === opt.key
                      ? 'border-stone-800 bg-[#ffd166]'
                      : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400',
                  )}
                >
                  <span className="block text-[11px] font-black">{opt.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>

            <label className="mt-3 block text-xs font-bold text-stone-700">反馈内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="请描述遇到的问题或想要的功能…"
              className="mt-1.5 w-full resize-none rounded-md border-2 border-stone-800 bg-white px-2.5 py-2 text-xs font-medium shadow-[2px_2px_0_#292524] outline-none focus:bg-[#fffbe9]"
            />
            <p className="mt-1 text-right text-[10px] text-stone-400">{content.length}/2000</p>

            <label className="mt-1 block text-xs font-bold text-stone-700">
              联系方式 <span className="font-normal text-stone-400">（选填，方便管理员找你确认）</span>
            </label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={100}
              placeholder="微信号 / 手机号等"
              className="mt-1.5 w-full rounded-md border-2 border-stone-300 bg-white px-2.5 py-2 text-xs font-medium outline-none focus:border-emerald-600"
            />

            {error && (
              <p
                role="alert"
                className="mt-2 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
              >
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-md border-2 border-stone-800 bg-white px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#ffd166] px-3 text-xs font-bold shadow-[2px_2px_0_#292524] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
                提交反馈
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
