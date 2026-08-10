'use client'

import { useCallback, useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
  acceptCandidate,
  computeDiffStats,
  createInitialWorkflowState,
  failPolishRequest,
  receivePolishCandidate,
  regenerateWithStyle,
  rejectCandidate,
  restoreLastAccepted,
  startPolishRequest,
  type PolishWorkflowState,
} from '@/lib/ai-diff-workflow'
import { candidateDiffSegments, computeDiff, type DiffSegment, type PolishCandidate } from '@/lib/text-diff'
import { captureError, track, EditorEvents } from '@/lib/analytics'
import { markdownToTiptapDoc, tiptapDocToMarkdown } from '@/lib/content-projection'
import { cn } from '@/lib/utils'
import {
  CheckCircle2, Undo2, RotateCcw, Sparkles,
  XCircle, ListChecks, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type PolishScope = 'full' | 'selection'

export interface AiDiffControllerHandle {
  beginRequest: (scope: PolishScope) => void
  applyStream: (text: string) => void
  finishStream: (finalText: string, style: string) => void
  fail: (error: string) => void
  getSnapshotBeforeRequest: () => { markdown: string; doc: JSONContent } | null
  readonly state: PolishWorkflowState | null
}

export interface AiDiffPanelProps {
  originalMarkdown: string
  /** 润色完成后（accept 或 restore），通知外层更新内容 */
  onApplyMarkdown: (markdown: string) => void
  pageType: 'new-post' | 'edit-post'
  postId?: string
  /** 是否启用细粒度 review（关闭=直接应用润色结果，仅保留“恢复原稿”） */
  reviewEnabled?: boolean
  /** 请求样式枚举 */
  styles?: Array<{ key: string; label: string }>
  /** 当用户点击“换一种风格→重新生成”时，外层用此回调调用 AI */
  onRegenerate: (style: string) => Promise<string> | string
  /** 当前润色请求中：是否正在加载 */
  requesting: boolean
  setRequesting: (v: boolean) => void
  /** 原始快照（doc），用于整体还原 */
  originalSnapshot?: JSONContent | null
  onRestoreSnapshot?: () => void
}

const DEFAULT_STYLES: Array<{ key: string; label: string }> = [
  { key: 'natural', label: '自然流畅' },
  { key: 'formal', label: '正式严谨' },
  { key: 'friendly', label: '轻松亲切' },
  { key: 'concise', label: '简洁精炼' },
  { key: 'vivid', label: '生动细节' },
]

export function AiDiffPanel(props: AiDiffPanelProps) {
  const {
    originalMarkdown,
    onApplyMarkdown,
    pageType,
    postId,
    reviewEnabled = true,
    styles = DEFAULT_STYLES,
    onRegenerate,
    requesting,
    setRequesting,
    originalSnapshot,
    onRestoreSnapshot,
  } = props

  const [state, setState] = useState<PolishWorkflowState>(() => createInitialWorkflowState(originalMarkdown))
  const [applyMode, setApplyMode] = useState<'diff' | 'polished' | 'original'>('diff')

  // 当前润色候选的分段 diff
  const segments: DiffSegment[] = useMemo(() => {
    if (!state.candidate) return []
    return candidateDiffSegments(state.candidate)
  }, [state.candidate])

  const stats = useMemo(() => computeDiffStats(segments), [segments])

  const onOriginalChange = useCallback((next: string) => {
    // 外层正文改动时，同步更新 idle 态的 originalValue，避免用户开始润色拿的是旧快照
    setState((prev) => {
      if (prev.stage !== 'idle') return prev
      return createInitialWorkflowState(next)
    })
  }, [])

  // 对外：页面正文变化时，同步 idle 态
  if (state.stage === 'idle' && state.currentValue !== originalMarkdown && state.candidate == null) {
    onOriginalChange(originalMarkdown)
  }

  const handleStart = useCallback(async (styleKey: string) => {
    if (requesting) return
    setRequesting(true)
    setState((prev) => startPolishRequest(prev))
    track(EditorEvents.PolishStart, {
      pageType,
      postId,
      style: styleKey,
      scope: state.selection ? 'selection' : 'full',
    })
    try {
      const result = await onRegenerate(styleKey)
      setState((prev) => receivePolishCandidate(prev, result, styleKey))
      track(EditorEvents.PolishSuccess, {
        pageType,
        postId,
        style: styleKey,
        inserted: stats.inserted,
        deleted: stats.deleted,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState((prev) => failPolishRequest(prev, msg))
      captureError(e, { component: 'AiDiffPanel.handleStart', extra: { pageType, postId, style: styleKey } })
      track(EditorEvents.PolishError, { pageType, postId, error: msg })
    } finally {
      setRequesting(false)
    }
  }, [requesting, setRequesting, state.selection, onRegenerate, pageType, postId, stats.inserted, stats.deleted])

  const handleRegenerate = useCallback((styleKey: string) => {
    setState((prev) => regenerateWithStyle(prev, styleKey))
    void handleStart(styleKey)
  }, [handleStart])

  const handleAccept = useCallback(() => {
    setState((prev) => {
      const next = acceptCandidate(prev)
      onApplyMarkdown(next.currentValue)
      track(EditorEvents.PolishAccept, {
        pageType,
        postId,
        style: next.history[next.history.length - 1]?.candidateId
          ? state.candidate?.style
          : undefined,
      })
      return next
    })
  }, [onApplyMarkdown, pageType, postId, state.candidate?.style])

  const handleReject = useCallback(() => {
    setState((prev) => {
      track(EditorEvents.PolishReject, { pageType, postId })
      return rejectCandidate(prev)
    })
  }, [pageType, postId])

  const handleRestore = useCallback(() => {
    setState((prev) => {
      const next = restoreLastAccepted(prev)
      onApplyMarkdown(next.currentValue)
      track(EditorEvents.PolishRestore, { pageType, postId })
      return next
    })
  }, [onApplyMarkdown, pageType, postId])

  const diffPreview = useMemo(() => {
    if (!state.candidate) return null
    if (applyMode === 'original') {
      return <OriginalTextPreview text={state.candidate.original} />
    }
    if (applyMode === 'polished') {
      return <OriginalTextPreview text={state.candidate.polished} />
    }
    return <DiffLineView segments={segments} />
  }, [state.candidate, applyMode, segments])

  const stage = state.stage

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={requesting || stage === 'requesting'}
              className="h-8 gap-1.5 text-xs"
            >
              {requesting || stage === 'requesting' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {state.candidate ? '换一种风格' : (state.selection ? 'AI 润色选段' : 'AI 润色全文')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>选择润色风格</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {styles.map((s) => (
              <DropdownMenuItem
                key={s.key}
                onSelect={() => state.candidate ? handleRegenerate(s.key) : void handleStart(s.key)}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {reviewEnabled && state.candidate && stage === 'previewing' && (
          <>
            <div className="inline-flex items-center overflow-hidden rounded-md border text-xs">
              {(['diff', 'polished', 'original'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setApplyMode(mode)}
                  className={cn(
                    'px-2.5 py-1 transition-colors',
                    applyMode === mode
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {mode === 'diff' ? '差异' : mode === 'polished' ? '润色后' : '原稿'}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              <ListChecks className="mr-1 inline size-3.5" />
              插入 {stats.inserted} · 删除 {stats.deleted}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {state.history.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={handleRestore}
                >
                  <Undo2 className="size-3.5" />撤回上次采纳
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={handleReject}
              >
                <XCircle className="size-3.5" />不采纳
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                onClick={handleAccept}
              >
                <CheckCircle2 className="size-3.5" />采纳修改
              </Button>
            </div>
          </>
        )}

        {!reviewEnabled && originalSnapshot && onRestoreSnapshot && stage === 'accepted' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-primary"
            onClick={() => {
              onRestoreSnapshot()
              track(EditorEvents.PolishRestore, { pageType, postId, simplified: true })
            }}
          >
            <RotateCcw className="size-3.5" />恢复原稿
          </Button>
        )}
      </div>

      {stage === 'error' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          润色失败：{state.lastError ?? '未知错误'}
        </div>
      )}

      {reviewEnabled && state.candidate && diffPreview && (
        <div className="max-h-80 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-sm leading-relaxed">
          {diffPreview}
        </div>
      )}
    </div>
  )
}

function DiffLineView({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      {segments.map((s, idx) => {
        if (s.op === 'equal') return <span key={idx}>{s.text}</span>
        if (s.op === 'insert') {
          return (
            <span key={idx} className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 underline decoration-emerald-400/40 underline-offset-2">
              {s.text}
            </span>
          )
        }
        return (
          <span key={idx} className="rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 line-through decoration-rose-400/60">
            {s.text}
          </span>
        )
      })}
    </div>
  )
}

function OriginalTextPreview({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-foreground">{text}</div>
  )
}

// 简单工具：给 rich-text 侧把“选区润色/全文润色”的候选以块级（paragraph 粒度）方式拆出来
// 提供给外层做“逐块采纳/拒绝”入口；如果后续真的要做逐块 UI，可以在此基础上渲染分块 diff。
export function splitCandidateByParagraphs(
  candidate: PolishCandidate,
): Array<{ original: string; polished: string; segments: DiffSegment[] }> {
  const orig = candidate.original.split(/\n\n+/)
  const polish = candidate.polished.split(/\n\n+/)
  const len = Math.max(orig.length, polish.length)
  const out: Array<{ original: string; polished: string; segments: DiffSegment[] }> = []
  for (let i = 0; i < len; i++) {
    const o = orig[i] ?? ''
    const p = polish[i] ?? ''
    out.push({ original: o, polished: p, segments: computeDiff(o, p) })
  }
  return out
}

// 兼容包装：外层如果只想把 Markdown 作为状态机值使用，可借助这两个纯函数做双向转换
export function docFromMarkdown(md: string): JSONContent {
  return markdownToTiptapDoc(md)
}

export function markdownFromDoc(doc: JSONContent): string {
  return tiptapDocToMarkdown(doc)
}
