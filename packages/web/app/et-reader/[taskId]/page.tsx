'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  List,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  Minus,
  Sun,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- 类型 ----------

interface Chapter {
  index: number
  id: string
  title: string
  kind?: string
  status: 'PENDING' | 'TRANSLATING' | 'TRANSLATED' | 'REVIEWED'
}

interface ChunkPair {
  source_html?: string
  translated_html?: string
}

interface ContentData {
  index: number
  title: string
  kind?: string
  source_html?: string
  translated_html?: string
  chunk_pairs?: ChunkPair[]
  status?: string
}

const API = {
  chapters: (id: string) => `/et-api/tasks/${id}/chapters`,
  content: (id: string, i: number) => `/et-api/tasks/${id}/chapters/${i}/content`,
}

type Theme = 'paper' | 'dark'

const THEME_STYLE: Record<Theme, { page: string; card: string; dim: string; border: string }> = {
  paper: { page: 'bg-[#f7f3ea] text-[#3a3226]', card: 'bg-[#fdfaf4] text-[#3a3226] border-[#e4dccb]', dim: 'text-[#8a7f6d]', border: 'border-[#e4dccb]' },
  dark: { page: 'bg-[#10151b] text-[#c9ced6]', card: 'bg-[#171d25] text-[#c9ced6] border-[#2a323d]', dim: 'text-[#77808d]', border: 'border-[#2a323d]' },
}

export default function ReaderPage() {
  const params = useParams<{ taskId: string }>()
  const taskId = params.taskId

  const [chapters, setChapters] = useState<Chapter[]>([])
  const [bookTitle, setBookTitle] = useState('')
  const [current, setCurrent] = useState(0)
  const [content, setContent] = useState<ContentData | null>(null)
  const [ready, setReady] = useState(false)

  // 沉浸式：工具栏浮层自动隐藏
  const [menuVisible, setMenuVisible] = useState(true)
  const [fontSize, setFontSize] = useState(18)
  const [theme, setTheme] = useState<Theme>('paper')
  const [tocOpen, setTocOpen] = useState(false)
  const [pairModal, setPairModal] = useState<ChunkPair | null>(null)

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // 播放器式浏览器原生全屏（隐藏地址栏/标签页）
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => void
      }
      if (el.requestFullscreen) el.requestFullscreen()
      else el.webkitRequestFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const themeStyle = THEME_STYLE[theme]

  const showMenu = useCallback(() => {
    setMenuVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setMenuVisible(false), 3500)
  }, [])

  const toggleMenu = useCallback(() => {
    setMenuVisible((v) => {
      if (!v) {
        // 即将显示
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setMenuVisible(false), 3500)
      }
      return !v
    })
  }, [])

  const loadChapters = useCallback(async () => {
    try {
      const res = await fetch(API.chapters(taskId))
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error)
      setChapters(data.chapters ?? [])
      if (!bookTitle) setBookTitle(data.book_title ?? '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载目录失败')
    }
  }, [taskId, bookTitle])

  const loadContent = useCallback(async (index: number) => {
    try {
      const res = await fetch(API.content(taskId, index))
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error)
      setContent(data)
      setReady(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载章节失败')
    }
  }, [taskId])

  useEffect(() => {
    loadChapters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadChapters])

  useEffect(() => {
    loadContent(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // 翻译中实时刷新
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(API.chapters(taskId))
        const data = await res.json()
        setChapters(data.chapters ?? [])
      } catch { /* 忽略 */ }
    }, 3000)
    return () => clearInterval(timer)
  }, [taskId])

  const translated = content?.status === 'TRANSLATED' || content?.status === 'REVIEWED'
  const pairs = content?.chunk_pairs ?? []
  const prev = current > 0
  const next = current < chapters.length - 1

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= chapters.length) return
    setCurrent(index)
    setTocOpen(false)
    if (contentRef.current) contentRef.current.scrollTo({ top: 0 })
  }, [chapters.length])

  // 键盘与点击翻章
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pairModal) return
      if (e.key === 'ArrowLeft') goTo(current - 1)
      if (e.key === 'ArrowRight') goTo(current + 1)
      if (e.key === 'Escape') {
        setPairModal(null)
        setTocOpen(false)
      }
      if (e.key === ' ') showMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, pairModal, goTo, showMenu])

  // 点击正文空白区：唤出/隐藏工具栏
  const handlePageClick = () => {
    if (pairModal || tocOpen) return
    toggleMenu()
  }

  // 左/右边缘点击翻章（微信读书式）
  const handleZoneClick = (dir: -1 | 1) => {
    if (pairModal || tocOpen) return
    if (dir === -1 ? prev : next) {
      showMenu()
      goTo(current + dir)
    }
  }

  if (!ready) {
    return (
      <div className={cn('flex h-[100dvh] items-center justify-center', themeStyle.page)}>
        <div className={cn('flex items-center gap-2 text-sm', themeStyle.dim)}>
          <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          正在打开书籍…
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative flex h-[100dvh] select-none flex-col overflow-hidden', themeStyle.page)}>
      {/* 全局阅读排版样式 */}
      <style>{`
        .et-body { text-indent: 2em; }
        .et-body p { text-indent: 2em; margin: 0 0 1.1em 0; }
        .et-body h1, .et-body h2, .et-body h3, .et-body h4 { text-indent: 0; margin: 1.6em 0 0.8em; }
        .et-body h1 { text-align: center; font-weight: 700; }
      `}</style>

      {/* 左右翻章热区 */}
      {!pairModal && !tocOpen && (
        <>
          <div
            className="absolute inset-y-0 left-0 z-10 w-[16%] cursor-w-resize"
            onClick={() => handleZoneClick(-1)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 right-0 z-10 w-[16%] cursor-e-resize"
            onClick={() => handleZoneClick(1)}
            aria-hidden
          />
        </>
      )}

      {/* 正文（占满全屏，点击空白唤出菜单） */}
      <div
        ref={contentRef}
        className={cn('scrollbar-none absolute inset-0 overflow-y-auto', themeStyle.page)}
        onClick={handlePageClick}
      >
        <div className="mx-auto min-h-full max-w-[42rem] px-8 pb-32 pt-[18vh]">
          <h1
            className="mb-10 text-center font-medium leading-snug tracking-wide"
            style={{ fontSize: fontSize + 8 }}
          >
            {content?.title || `章节 ${current + 1}`}
          </h1>

          {translated && pairs.length > 0 ? (
            <div className="space-y-8">
              {pairs.map((pair, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPairModal(pair)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      setPairModal(pair)
                    }
                  }}
                  className="cursor-pointer transition-colors"
                  title="点击查看原文"
                >
                  <div
                    className={cn('et-body leading-[1.9]')}
                    style={{ fontSize }}
                    dangerouslySetInnerHTML={{ __html: pair.translated_html ?? '' }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn('et-body leading-[1.9]', themeStyle.dim)}
              style={{ fontSize }}
              dangerouslySetInnerHTML={{ __html: content?.source_html ?? '' }}
            />
          )}
        </div>
      </div>

      {/* 顶部工具栏（自动隐藏浮层） */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b px-3 transition-all duration-300',
          themeStyle.card,
          themeStyle.border,
          menuVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/community/tools/epub-translator"
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5')}
            aria-label="返回工作台"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => setTocOpen(true)}
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5')}
            aria-label="目录"
          >
            <List className="size-4" />
          </button>
          <div className="ml-1 min-w-0">
            <p className="truncate text-[13px] font-semibold">{content?.title || '…'}</p>
            <p className={cn('truncate text-[11px]', themeStyle.dim)}>
              {bookTitle} · {current + 1}/{chapters.length} · {translated ? '译文' : '原文'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setFontSize((s) => Math.max(15, s - 1))}
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            aria-label="减小字号"
          >
            <Minus className="size-4" />
          </button>
          <span className={cn('w-7 text-center text-xs tabular-nums', themeStyle.dim)}>{fontSize}</span>
          <button
            type="button"
            onClick={() => setFontSize((s) => Math.min(26, s + 1))}
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            aria-label="增大字号"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'paper' ? 'dark' : 'paper'))}
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            aria-label="切换夜间模式"
          >
            {theme === 'paper' ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            aria-label={isFullscreen ? '退出全屏' : '全屏阅读'}
            title={isFullscreen ? '退出全屏 (Esc)' : '全屏阅读'}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {/* 底部翻页（自动隐藏浮层） */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-30 flex items-center justify-between border-t px-4 py-2.5 transition-all duration-300',
          themeStyle.card,
          themeStyle.border,
          menuVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={!prev}
          onClick={() => goTo(current - 1)}
          className={cn(
            'flex h-9 max-w-[45%] items-center gap-1 rounded-full px-3 text-[13px] transition-colors hover:bg-black/5',
            themeStyle.dim,
            !prev && 'pointer-events-none opacity-30',
          )}
        >
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate">{prev ? chapters[current - 1].title : '上一章'}</span>
        </button>
        <span className={cn('shrink-0 text-[11px]', themeStyle.dim)}>
          点击左右边缘翻章
        </span>
        <button
          type="button"
          disabled={!next}
          onClick={() => goTo(current + 1)}
          className={cn(
            'flex h-9 max-w-[45%] items-center gap-1 rounded-full px-3 text-[13px] transition-colors hover:bg-black/5',
            themeStyle.dim,
            !next && 'pointer-events-none opacity-30',
          )}
        >
          <span className="truncate">{next ? chapters[current + 1].title : '下一章'}</span>
          <ChevronRight className="size-4 shrink-0" />
        </button>
      </div>

      {/* 目录抽屉 */}
      {tocOpen && (
        <div className="absolute inset-0 z-40">
          <div
            className={cn('absolute inset-0', theme === 'dark' ? 'bg-black/60' : 'bg-black/40')}
            onClick={() => setTocOpen(false)}
          />
          <aside className={cn('absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r shadow-2xl', themeStyle.card, themeStyle.border)}>
            <div className={cn('flex items-center justify-between border-b px-4 py-3', themeStyle.border)}>
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <BookOpenText className="size-4 text-primary" />
                <span className="truncate">{bookTitle}</span>
              </p>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                aria-label="关闭目录"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className={cn('flex-1 overflow-y-auto p-2', themeStyle.page)}>
              {chapters.map((ch) => {
                const kindLabel = ch.kind === 'cover' ? '封面' : ch.kind === 'title-page' ? '扉页' : ch.kind === 'copyright-page' ? '版权' : ch.kind === 'toc' ? '目录' : null
                const isCurrent = ch.index === current
                return (
                  <button
                    key={ch.index}
                    type="button"
                    onClick={() => goTo(ch.index)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors',
                      isCurrent ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-black/5',
                    )}
                  >
                    <span className={cn('w-5 shrink-0 text-right font-mono text-[10px]', themeStyle.dim)}>{ch.index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{ch.title || `章节 ${ch.index + 1}`}</span>
                    {kindLabel && <span className="shrink-0 text-[10px] text-primary/70">{kindLabel}</span>}
                    {ch.status === 'TRANSLATED' && <span className="shrink-0 text-[10px] text-emerald-600">已译</span>}
                  </button>
                )
              })}
            </div>
          </aside>
        </div>
      )}

      {/* 原文对照弹层（极简） */}
      {pairModal && (
        <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" onClick={() => setPairModal(null)}>
          <div className={cn('absolute inset-0', theme === 'dark' ? 'bg-black/70' : 'bg-black/45')} />
          <div
            className={cn(
              'relative flex max-h-[75dvh] w-full max-w-2xl flex-col rounded-t-2xl border shadow-2xl sm:rounded-2xl',
              themeStyle.card,
              themeStyle.border,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn('flex items-center justify-between border-b px-5 py-3', themeStyle.border)}>
              <p className="text-[13px] font-semibold">原文对照</p>
              <button
                type="button"
                onClick={() => setPairModal(null)}
                className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div>
                <p className={cn('mb-1.5 text-[10px] font-semibold uppercase tracking-wider', theme === 'paper' ? 'text-amber-700' : 'text-amber-400')}>原文</p>
                <div
                  className={cn('rounded-lg border p-3 leading-relaxed', themeStyle.page, themeStyle.border, themeStyle.dim)}
                  style={{ fontSize: Math.max(14, fontSize - 2) }}
                  dangerouslySetInnerHTML={{ __html: pairModal.source_html ?? '' }}
                />
              </div>
              <div>
                <p className={cn('mb-1.5 text-[10px] font-semibold uppercase tracking-wider', theme === 'paper' ? 'text-emerald-700' : 'text-emerald-400')}>译文</p>
                <div
                  className={cn('rounded-lg border p-3 leading-relaxed', themeStyle.page, themeStyle.border)}
                  style={{ fontSize: Math.max(14, fontSize - 2) }}
                  dangerouslySetInnerHTML={{ __html: pairModal.translated_html ?? '' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
