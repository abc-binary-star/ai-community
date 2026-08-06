'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Copy, Plus, Trash2, X } from 'lucide-react'
import { DuplicateBookError } from '../lib/api'
import { useActivityStore, useCurrentTeam, useTile } from '../lib/store'
import type { CheckInDraftBook } from '../lib/types'

interface BookFormRow {
  id: string
  title: string
  author: string
  wordCount: string
  durationMinutes: string
  coverUrl: string
  genre: string
  note: string
}

let rowSeq = 1
function emptyRow(): BookFormRow {
  rowSeq += 1
  return {
    id: `row-${rowSeq}`,
    title: '',
    author: '',
    wordCount: '',
    durationMinutes: '',
    coverUrl: '',
    genre: '',
    note: '',
  }
}

/**
 * 打卡提交表单（PRD 8.1 / 验收标准 10）。
 * 书名 + 作者 + 字数为必填三要素，提交时按成员 + 书名 + 作者查重，
 * 命中则拦截并提示已在第 N 格打卡。
 */
export function CheckInFormDialog({
  tileIndex,
  onClose,
}: {
  tileIndex: number
  onClose: () => void
}) {
  const team = useCurrentTeam()
  const tile = useTile(tileIndex)
  const findDuplicates = useActivityStore((s) => s.findDuplicates)
  const submitCheckIn = useActivityStore((s) => s.submitCheckIn)
  const currentMemberId = useActivityStore((s) => s.myMemberId ?? '')

  const [rows, setRows] = useState<BookFormRow[]>([emptyRow()])
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [duplicates, setDuplicates] = useState<string[]>([])
  const [groupText, setGroupText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const updateRow = (id: string, field: keyof BookFormRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))
  }

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()])
  }

  const handleSubmit = async () => {
    if (submitting) return
    const valid = rows.filter((r) => r.title.trim() && r.author.trim() && r.wordCount.trim())
    if (valid.length === 0) return

    // 本地查重先给即时反馈，权威查重仍在服务端（P1-8）
    const dups = findDuplicates(
      currentMemberId,
      valid.map((r) => ({ title: r.title.trim(), author: r.author.trim() })),
    )
    if (dups.length > 0) {
      setDuplicates(dups)
      return
    }

    const books: CheckInDraftBook[] = valid.map((r) => ({
      title: r.title.trim(),
      author: r.author.trim(),
      wordCount: parseInt(r.wordCount, 10) || 0,
      durationMinutes: r.durationMinutes ? parseInt(r.durationMinutes, 10) : undefined,
      coverUrl: r.coverUrl.trim() || undefined,
      genre: r.genre.trim() || undefined,
      note: r.note.trim() || undefined,
    }))

    setSubmitting(true)
    setError(null)
    try {
      await submitCheckIn(tileIndex, books, evidenceUrl.trim() || undefined)
    } catch (err) {
      // 服务端查重命中时回显命中书名与所在格子（验收标准 10）
      if (err instanceof DuplicateBookError) {
        setDuplicates(
          err.titles.map((t) => {
            const tileNo = err.duplicates[t]
            return tileNo ? `${t}（已在第 ${tileNo} 格打卡）` : t
          }),
        )
      } else {
        setError(err instanceof Error ? err.message : '提交失败，请稍后重试')
      }
      return
    } finally {
      setSubmitting(false)
    }

    const text = books
      .map((b) => `《${b.title}》 ${b.author} ${b.wordCount.toLocaleString('zh-CN')} 字`)
      .join('\n')
    setGroupText(`#地狱打卡 ${team?.name ?? ''}-第${tileIndex}格-${books.length}本\n${text}`)
  }

  const copyGroupText = () => {
    navigator.clipboard.writeText(groupText)
  }

  if (groupText) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-title"
        className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] p-5 shadow-[6px_6px_0_#292524] sm:rounded-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="success-title" className="text-lg font-black text-stone-900">
            提交成功
          </h2>
          <p className="mt-1 text-xs font-medium text-stone-500">
            已进入 AI 初审队列，审核通过后计入任务进度与榜单。
          </p>
          <div className="mt-4 rounded-md border border-stone-300 bg-white p-3">
            <p className="text-[11px] font-medium text-stone-500">群内打卡格式（可复制同步到群内接龙）</p>
            <pre className="mt-1.5 whitespace-pre-wrap break-words text-xs text-stone-800">{groupText}</pre>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={copyGroupText}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-stone-800 bg-stone-800 text-xs font-bold text-white transition-colors hover:bg-stone-700"
            >
              <Copy className="size-3.5" />
              复制格式文本
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 flex-1 rounded-lg bg-[#78c6a3] text-xs font-black text-stone-900 transition-colors hover:bg-[#65b891]"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-lg border-2 border-stone-800 bg-[#fffdf5] p-5 shadow-[6px_6px_0_#292524] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="checkin-title" className="text-lg font-black text-stone-900">
              提交打卡 · 第 {tileIndex} 格
            </h2>
            <p className="mt-0.5 text-xs font-medium text-stone-500">{tile?.title ?? ''}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 rounded-md border border-amber-300 bg-[#fff0b8] px-3 py-2 text-xs font-bold text-amber-900">
          书名、作者、字数为必填三要素，缺一不可提交。同一本书全期只能打卡一次。
        </p>

        {duplicates.length > 0 && (
          <div className="mt-3 rounded-md border-2 border-rose-300 bg-rose-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
              <AlertCircle className="size-3.5" />
              以下书目已在本期活动中打卡，不可重复提交
            </p>
            <ul className="mt-1.5 list-inside list-disc text-xs text-rose-700">
              {duplicates.map((title, i) => (
                <li key={i}>{title}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setDuplicates([])}
              className="mt-2 text-[11px] text-rose-400 underline"
            >
              我知道了
            </button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
          >
            {error}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-md border border-stone-300 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-stone-500">书目 {idx + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded p-1 text-stone-500 hover:bg-rose-50 hover:text-stone-700"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  placeholder="书名 *"
                  value={row.title}
                  onChange={(e) => updateRow(row.id, 'title', e.target.value)}
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="作者 *"
                  value={row.author}
                  onChange={(e) => updateRow(row.id, 'author', e.target.value)}
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="字数 *"
                  value={row.wordCount}
                  onChange={(e) => updateRow(row.id, 'wordCount', e.target.value.replace(/\D/g, ''))}
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="封面图 URL（颜色类任务必填）"
                  value={row.coverUrl}
                  onChange={(e) => updateRow(row.id, 'coverUrl', e.target.value)}
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="题材 / 分类（题材分类类任务必填）"
                  value={row.genre}
                  onChange={(e) => updateRow(row.id, 'genre', e.target.value)}
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="阅读时长（分钟，时长类任务必填）"
                  value={row.durationMinutes}
                  onChange={(e) =>
                    updateRow(row.id, 'durationMinutes', e.target.value.replace(/\D/g, ''))
                  }
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                <textarea
                  placeholder="备注（选填）"
                  value={row.note}
                  onChange={(e) => updateRow(row.id, 'note', e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-md border-2 border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* 阅读记录、书页或读书软件截图，供人工终审核验（PRD 8.1） */}
        <input
          type="text"
          placeholder="证据截图 URL（阅读记录 / 书页 / 读书软件截图）"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          className="mt-3 h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
        />

        <button
          type="button"
          onClick={addRow}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 text-xs font-medium text-stone-500 transition-colors hover:border-stone-800 hover:text-stone-900"
        >
          <Plus className="size-3.5" />
          添加更多书目
        </button>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-md border-2 border-stone-300 text-sm text-stone-700 transition-colors hover:bg-stone-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="h-10 flex-1 rounded-lg bg-[#78c6a3] text-sm font-black text-stone-900 transition-colors hover:bg-[#65b891] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
          >
            {submitting ? '提交中…' : '提交打卡'}
          </button>
        </div>
      </div>
    </div>
  )
}
