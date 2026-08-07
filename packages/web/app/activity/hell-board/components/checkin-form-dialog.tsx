'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Copy, Plus, Search, Trash2, X } from 'lucide-react'
import { DuplicateBookError, fetchBookLibrary } from '../lib/api'
import { formatReadingMinutes, formatWords } from '../lib/rules'
import { useActivityStore, useCurrentTeam, useTile } from '../lib/store'
import type { BookLibraryItem, CheckInDraftBook } from '../lib/types'
import { ImageUploadField } from './image-upload-field'

interface BookFormRow {
  id: string
  title: string
  author: string
  /** 单位为万字，允许小数，提交时乘 10000 转整数 */
  wanWords: string
  durationHours: string
  durationMins: string
  coverUrl: string
}

let rowSeq = 1
function emptyRow(): BookFormRow {
  rowSeq += 1
  return {
    id: `row-${rowSeq}`,
    title: '',
    author: '',
    wanWords: '',
    durationHours: '',
    durationMins: '',
    coverUrl: '',
  }
}

/** 万字转真实字数：0.5 → 5000。四舍五入避免浮点误差留下 4999 */
function wanToWords(wan: string): number {
  const n = Number.parseFloat(wan)
  return Number.isFinite(n) ? Math.round(n * 10000) : 0
}

/**
 * 打卡提交表单（PRD 8.1 / 验收标准 10）。
 * 书名 + 作者 + 字数为必填三要素，提交时按成员 + 书名 + 作者查重，
 * 命中则拦截并提示已在第 N 格打卡。
 *
 * initialBooks 用于「驳回后重新提交」：预填被驳回的书目信息，
 * 提交仍落在队伍当前格（服务端校验），原驳回记录被新提交替换。
 */
export function CheckInFormDialog({
  tileIndex,
  onClose,
  initialBooks,
}: {
  tileIndex: number
  onClose: () => void
  initialBooks?: CheckInDraftBook[]
}) {
  const team = useCurrentTeam()
  const tile = useTile(tileIndex)
  const findDuplicates = useActivityStore((s) => s.findDuplicates)
  const submitCheckIn = useActivityStore((s) => s.submitCheckIn)
  const currentMemberId = useActivityStore((s) => s.myMemberId ?? '')

  // 颜色类任务需靠封面图核验，其余格子不展示封面字段
  const needCover = tile?.taskType === 'cover-color'
  // 作者仅作者相关格必填：作者国籍 / 同一作者 / 群内交叉
  const needAuthor =
    tile?.taskType === 'author-nationality' ||
    tile?.taskType === 'same-author' ||
    tile?.taskType === 'group-cross'
  // 字数仅累计字数格必填，其余格子选填
  const needWords = tile?.taskType === 'total-words'

  const [rows, setRows] = useState<BookFormRow[]>(() => {
    if (!initialBooks?.length) return [emptyRow()]
    return initialBooks.map((b) => ({
      id: `row-${(rowSeq += 1)}`,
      title: b.title,
      author: b.author,
      wanWords: b.wordCount > 0 ? String(b.wordCount / 10000) : '',
      durationHours: b.durationMinutes ? String(Math.floor(b.durationMinutes / 60)) : '',
      durationMins: b.durationMinutes ? String(b.durationMinutes % 60 || '') : '',
      coverUrl: b.coverUrl ?? '',
    }))
  })
  const isResubmit = Boolean(initialBooks?.length)
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [duplicates, setDuplicates] = useState<string[]>([])
  const [groupText, setGroupText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 群内交叉格（第 20 格）：从群内已通过书库搜索选书，自动回填书名/作者/字数
  const isGroupCross = tile?.taskType === 'group-cross'
  const [libraryKeyword, setLibraryKeyword] = useState('')
  const [libraryResults, setLibraryResults] = useState<BookLibraryItem[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const libraryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isGroupCross || libraryKeyword.trim().length < 1) {
      setLibraryResults([])
      setLibraryOpen(false)
      return
    }
    if (libraryTimer.current) clearTimeout(libraryTimer.current)
    libraryTimer.current = setTimeout(async () => {
      setLibraryLoading(true)
      try {
        setLibraryResults(await fetchBookLibrary(libraryKeyword.trim()))
        setLibraryOpen(true)
      } catch {
        setLibraryResults([])
      } finally {
        setLibraryLoading(false)
      }
    }, 250)
    return () => {
      if (libraryTimer.current) clearTimeout(libraryTimer.current)
    }
  }, [isGroupCross, libraryKeyword])

  // 选择书库条目：回填到第一个书名为空的行，否则追加一行
  const pickLibraryBook = (item: BookLibraryItem) => {
    setRows((prev) => {
      const target = prev.find((r) => !r.title.trim())
      const fill = {
        title: item.title,
        author: item.author,
        wanWords: item.wordCount > 0 ? String(item.wordCount / 10000) : '',
      }
      if (target) return prev.map((r) => (r.id === target.id ? { ...r, ...fill } : r))
      return [...prev, { ...emptyRow(), ...fill }]
    })
    setLibraryKeyword('')
    setLibraryResults([])
    setLibraryOpen(false)
  }

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
    // 累计时长格必填阅读时长，其余格子时长可留空（服务端同样校验）
    const isDurationTile = tile?.taskType === 'total-duration'
    const rowMinutes = (r: BookFormRow) =>
      (parseInt(r.durationHours, 10) || 0) * 60 + (parseInt(r.durationMins, 10) || 0)
    const valid = rows.filter(
      (r) =>
        r.title.trim() &&
        (!needAuthor || r.author.trim()) &&
        (!needWords || wanToWords(r.wanWords) > 0) &&
        (!isDurationTile || rowMinutes(r) > 0),
    )
    if (valid.length === 0) {
      const missing = [
        '书名',
        !needAuthor ? '' : '作者',
        !needWords ? '' : '字数',
      ]
        .filter(Boolean)
        .join('、')
      setError(
        isDurationTile
          ? `本格为累计时长任务，请为每本书填写${missing}与阅读时长`
          : `请至少填写一本书的${missing}${needCover ? '并为每本书上传封面图' : ''}`,
      )
      return
    }
    if (isDurationTile && valid.length < rows.length) {
      setError('本格为累计时长任务，请为每本书都填写阅读时长')
      return
    }
    if (needCover && valid.some((r) => !r.coverUrl)) {
      setError('本格任务需核验封面颜色，请为每本书上传封面图')
      return
    }
    setError(null)

    // 本地查重先给即时反馈，权威查重仍在服务端（P1-8）。
    // 作者未填时与提交口径一致用「未知」占位，保证本地查重键与服务端一致
    const dups = findDuplicates(
      currentMemberId,
      valid.map((r) => ({ title: r.title.trim(), author: r.author.trim() || '未知' })),
    )
    if (dups.length > 0) {
      setDuplicates(dups)
      return
    }

    const books: CheckInDraftBook[] = valid.map((r) => {
      const totalMins =
        (parseInt(r.durationHours, 10) || 0) * 60 + (parseInt(r.durationMins, 10) || 0)
      return {
        title: r.title.trim(),
        // 作者选填的格子未填时以「未知」占位（服务端同口径兜底）
        author: r.author.trim() || '未知',
        // 字数选填的格子未填时为 0
        wordCount: wanToWords(r.wanWords),
        durationMinutes: totalMins > 0 ? totalMins : undefined,
        coverUrl: r.coverUrl || undefined,
      }
    })

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
      .map((b) => {
        const dur = b.durationMinutes ? ` ${formatReadingMinutes(b.durationMinutes)}` : ''
        return `《${b.title}》 ${b.author} ${formatWords(b.wordCount)}${dur}`
      })
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
            已进入审核流程：AI 初审或队长投票通过后计入任务进度与榜单。
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
          书名必填{needAuthor && '，本格为作者相关任务，作者必填'}
          {needWords && '，本格为累计字数任务，字数必填'}
          {!needAuthor && !needWords && '，作者与字数可选填'}
          。同一本书全期只能打卡一次。
        </p>

        {isResubmit && (
          <p className="mt-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
            重新提交：将计入队伍当前格（第 {tileIndex} 格），提交后原驳回记录会被替换。
          </p>
        )}

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

        {isGroupCross && (
          <div className="relative mt-4">
            <p className="mb-1.5 text-xs font-bold text-stone-600">
              本格为群内交叉：从群内已通过的书库选书
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={libraryKeyword}
                onChange={(e) => setLibraryKeyword(e.target.value)}
                onFocus={() => libraryResults.length > 0 && setLibraryOpen(true)}
                placeholder="输入书名或作者搜索…"
                className="h-9 w-full rounded-md border-2 border-stone-300 bg-white pl-8 pr-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
              />
              {libraryLoading && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">
                  搜索中…
                </span>
              )}
            </div>
            {libraryOpen && libraryResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border-2 border-stone-300 bg-white shadow-lg">
                {libraryResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pickLibraryBook(item)}
                      className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-emerald-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-stone-900">
                          《{item.title}》
                        </span>
                        <span className="block text-[10px] text-stone-500">
                          {item.author} · {formatWords(item.wordCount)}
                          {item.teamName ? ` · ${item.teamName}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 self-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        选用
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {libraryOpen && libraryKeyword.trim() && libraryResults.length === 0 && !libraryLoading && (
              <p className="absolute z-10 mt-1 w-full rounded-md border-2 border-stone-300 bg-white px-2.5 py-2 text-[11px] text-stone-400 shadow-lg">
                未在群内书库中找到匹配书目
              </p>
            )}
          </div>
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
                  placeholder={needAuthor ? '作者 *' : '作者（选填）'}
                  value={row.author}
                  onChange={(e) => updateRow(row.id, 'author', e.target.value)}
                  className="h-9 w-full rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                />
                {/* 字数以万字为单位，允许小数，如 12.5 表示 12.5 万字 */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={needWords ? '字数 *' : '字数（选填）'}
                    value={row.wanWords}
                    onChange={(e) =>
                      updateRow(row.id, 'wanWords', e.target.value.replace(/[^\d.]/g, ''))
                    }
                    className="h-9 min-w-0 flex-1 rounded-md border-2 border-stone-300 bg-white px-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none"
                  />
                  <span className="shrink-0 text-xs font-bold text-stone-500">万字</span>
                </div>

                {/* 阅读时长拆成小时 + 分钟两个下拉，避免手填分钟数 */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-stone-500">阅读时长</span>
                  <select
                    value={row.durationHours}
                    onChange={(e) => updateRow(row.id, 'durationHours', e.target.value)}
                    aria-label="阅读小时数"
                    className="h-9 min-w-0 flex-1 rounded-md border-2 border-stone-300 bg-white px-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="">0</option>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={String(h)}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="shrink-0 text-xs font-bold text-stone-500">小时</span>
                  <select
                    value={row.durationMins}
                    onChange={(e) => updateRow(row.id, 'durationMins', e.target.value)}
                    aria-label="阅读分钟数"
                    className="h-9 min-w-0 flex-1 rounded-md border-2 border-stone-300 bg-white px-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="">0</option>
                    {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                      <option key={m} value={String(m)}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className="shrink-0 text-xs font-bold text-stone-500">分钟</span>
                </div>

                {needCover && (
                  <ImageUploadField
                    value={row.coverUrl}
                    onChange={(url) => updateRow(row.id, 'coverUrl', url)}
                    label="上传封面图（本格任务需核验封面颜色）"
                    disabled={submitting}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 阅读记录、书页或读书软件截图，供人工终审核验（PRD 8.1） */}
        <div className="mt-3">
          <ImageUploadField
            value={evidenceUrl}
            onChange={setEvidenceUrl}
            label="上传证据截图（阅读记录 / 书页 / 软件截图）"
            disabled={submitting}
          />
        </div>

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
