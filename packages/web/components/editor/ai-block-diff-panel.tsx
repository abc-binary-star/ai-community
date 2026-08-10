'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  applyReadyAiDiffBlocks,
  computeDiffStats,
  decideAllAiDiffBlocks,
  hashAiDiffSource,
  pendingAiDiffBlockCount,
  updateAiDiffBlock,
  type AiDiffBlock,
} from '@/lib/ai-diff-workflow'
import { computeDiff, type DiffSegment } from '@/lib/text-diff'
import { captureError, EditorEvents, track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/** 单块请求超时（ms） */
const BLOCK_TIMEOUT = 60_000
/** 全部生成时的并发数 */
const CONCURRENCY = 2

interface AiBlockDiffPanelProps {
  initialBlocks: AiDiffBlock[]
  pageType: 'new-post' | 'edit-post'
  postId?: string
  /** 生成单块润色结果，支持取消 */
  onGenerateBlock: (blockId: string, originalMarkdown: string, style: string, signal: AbortSignal) => Promise<string>
  /** 应用单块润色到编辑器，返回 accepted/failed/stale */
  onApplyBlock: (block: AiDiffBlock) => 'accepted' | 'failed' | 'stale'
  /** 检查块当前内容是否与请求时一致，返回 true=新鲜 false=已变化 */
  onCheckBlockFreshness: (blockId: string, sourceVersion: string) => boolean
  onRestoreSnapshot: () => void
  onClose: () => void
}

const STYLES = [
  { key: 'natural', label: '自然流畅' },
  { key: 'formal', label: '正式严谨' },
  { key: 'friendly', label: '轻松亲切' },
  { key: 'concise', label: '简洁精炼' },
  { key: 'vivid', label: '生动细节' },
]

/** 为每个块创建带超时的 AbortController */
function createBlockAbortController(parentSignal: AbortSignal): AbortController {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('AI 润色超时')), BLOCK_TIMEOUT)
  parentSignal.addEventListener('abort', () => {
    clearTimeout(timer)
    controller.abort(parentSignal.reason)
  }, { once: true })
  return controller
}

/** 固定并发池：逐个领取任务并执行 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await fn(items[index], index)
    }
  })
  await Promise.all(workers)
}

export function AiBlockDiffPanel({
  initialBlocks,
  pageType,
  postId,
  onGenerateBlock,
  onApplyBlock,
  onCheckBlockFreshness,
  onRestoreSnapshot,
  onClose,
}: AiBlockDiffPanelProps) {
  const [blocks, setBlocks] = useState(initialBlocks)
  const [style, setStyle] = useState('natural')
  const [error, setError] = useState<string | null>(null)
  const [batchActive, setBatchActive] = useState(false)
  /** 批次 AbortController，关闭面板或重新生成时取消所有请求 */
  const batchAbortRef = useRef<AbortController | null>(null)
  /** 单块 AbortController 映射，用于重新生成单块时取消旧请求 */
  const blockAbortRef = useRef<Map<string, AbortController>>(new Map())

  // 组件卸载时取消所有请求
  useEffect(() => {
    const batch = batchAbortRef.current
    const blockMap = blockAbortRef.current
    return () => {
      batch?.abort(new Error('组件卸载'))
      blockMap.forEach((c) => c.abort(new Error('组件卸载')))
    }
  }, [])

  const generated = blocks.filter((block) => block.polishedMarkdown)
  const pending = pendingAiDiffBlockCount(blocks)
  const generatingCount = blocks.filter((b) => b.status === 'generating').length

  // 预计算所有块的 diff，避免渲染时重复计算
  const blockDiffs = useMemo(() => {
    const map = new Map<string, DiffSegment[]>()
    for (const block of generated) {
      map.set(block.blockId, computeDiff(block.originalMarkdown, block.polishedMarkdown))
    }
    return map
  }, [generated])

  const totals = useMemo(() => {
    let inserted = 0
    let deleted = 0
    for (const block of generated) {
      const stats = computeDiffStats(blockDiffs.get(block.blockId) ?? [])
      inserted += stats.inserted
      deleted += stats.deleted
    }
    return { inserted, deleted }
  }, [generated, blockDiffs])

  const generateOne = useCallback(async (block: AiDiffBlock, styleKey: string, parentSignal?: AbortSignal) => {
    const requestId = `${block.blockId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sourceVersion = hashAiDiffSource(block.originalMarkdown)

    // 取消该块的旧请求
    const oldController = blockAbortRef.current.get(block.blockId)
    if (oldController) oldController.abort(new Error('被新请求取代'))

    const controller = createBlockAbortController(parentSignal ?? new AbortController().signal)
    blockAbortRef.current.set(block.blockId, controller)

    setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
      status: 'generating',
      requestId,
      style: styleKey,
      sourceVersion,
      error: undefined,
      polishedMarkdown: '',
    }))
    setError(null)

    try {
      const polishedMarkdown = await onGenerateBlock(block.blockId, block.originalMarkdown, styleKey, controller.signal)
      if (controller.signal.aborted) return
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
        polishedMarkdown,
        status: 'ready',
        error: undefined,
      }))
      track(EditorEvents.PolishSuccess, { pageType, postId, style: styleKey, blockId: block.blockId })
    } catch (reason) {
      if (controller.signal.aborted) return
      const message = reason instanceof Error ? reason.message : 'AI 润色失败'
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
        status: 'failed',
        error: message,
      }))
      setError(message)
      captureError(reason, { component: 'AiBlockDiffPanel.generateOne', pageType, extra: { postId, blockId: block.blockId } })
      track(EditorEvents.PolishError, { pageType, postId, blockId: block.blockId, error: message })
    } finally {
      blockAbortRef.current.delete(block.blockId)
    }
  }, [onGenerateBlock, pageType, postId])

  const generateAll = useCallback(async (styleKey: string) => {
    if (batchActive) return
    setBatchActive(true)
    setStyle(styleKey)
    track(EditorEvents.PolishStart, { pageType, postId, style: styleKey, scope: 'blocks', count: blocks.length })

    // 取消旧批次
    batchAbortRef.current?.abort(new Error('被新批次取代'))
    const batchController = new AbortController()
    batchAbortRef.current = batchController

    try {
      await runWithConcurrency(blocks, CONCURRENCY, async (block) => {
        if (batchController.signal.aborted) return
        await generateOne(block, styleKey, batchController.signal)
      })
    } finally {
      setBatchActive(false)
    }
  }, [batchActive, blocks, generateOne, pageType, postId])

  const cancelAll = useCallback(() => {
    batchAbortRef.current?.abort(new Error('用户取消'))
    blockAbortRef.current.forEach((c) => c.abort(new Error('用户取消')))
    blockAbortRef.current.clear()
    setBlocks((current) => current.map((block) =>
      block.status === 'generating' ? { ...block, status: 'pending', error: undefined } : block,
    ))
    setBatchActive(false)
  }, [])

  const acceptOne = useCallback((block: AiDiffBlock) => {
    if (block.status !== 'ready' || !block.polishedMarkdown) return
    // 应用前检查内容版本
    if (!onCheckBlockFreshness(block.blockId, block.sourceVersion)) {
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
        status: 'stale',
        error: '原段落已变化，请重新生成',
      }))
      setError('该段原文已变化，请重新生成')
      return
    }
    const result = onApplyBlock(block)
    if (result === 'accepted') {
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, { status: 'accepted', error: undefined }))
      track(EditorEvents.PolishAccept, { pageType, postId, blockId: block.blockId, style })
    } else if (result === 'stale') {
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
        status: 'stale',
        error: '原段落已变化，请重新生成',
      }))
      setError('该段原文已变化，请重新生成')
    } else {
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
        status: 'failed',
        error: '无法应用该段修改',
      }))
      setError('无法应用该段修改')
    }
  }, [onApplyBlock, onCheckBlockFreshness, pageType, postId, style])

  const rejectOne = useCallback((blockId: string) => {
    setBlocks((current) => updateAiDiffBlock(current, blockId, { status: 'rejected', error: undefined }))
    track(EditorEvents.PolishReject, { pageType, postId, blockId })
  }, [pageType, postId])

  const acceptAll = useCallback(() => {
    // 全部采纳前检查每块的新鲜度
    const blocksToCheck = blocks.map((block) => {
      if (block.status === 'ready' && block.polishedMarkdown) {
        if (!onCheckBlockFreshness(block.blockId, block.sourceVersion)) {
          return { ...block, status: 'stale' as const, error: '原段落已变化，请重新生成' }
        }
      }
      return block
    })
    const summary = applyReadyAiDiffBlocks(blocksToCheck, onApplyBlock)
    setBlocks(summary.blocks)
    if (summary.failed > 0) {
      setError(`${summary.succeeded} 段已采纳，${summary.failed} 段失败，${summary.skipped} 段跳过`)
    } else {
      setError(null)
    }
    track(EditorEvents.PolishAccept, { pageType, postId, style, scope: 'all-blocks', succeeded: summary.succeeded, failed: summary.failed })
  }, [blocks, onApplyBlock, onCheckBlockFreshness, pageType, postId, style])

  const rejectAll = useCallback(() => {
    setBlocks((current) => decideAllAiDiffBlocks(current, 'rejected'))
    track(EditorEvents.PolishReject, { pageType, postId, scope: 'all-blocks' })
  }, [pageType, postId])

  const handleClose = useCallback(() => {
    cancelAll()
    onClose()
  }, [cancelAll, onClose])

  const handleRestore = useCallback(() => {
    cancelAll()
    onRestoreSnapshot()
  }, [cancelAll, onRestoreSnapshot])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" disabled={batchActive} className="h-8 gap-1.5 text-xs">
              {batchActive ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generated.length ? '全部重新生成' : '生成逐段润色'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>选择润色风格</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STYLES.map((item) => (
              <DropdownMenuItem key={item.key} onSelect={() => void generateAll(item.key)}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {batchActive && (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={cancelAll}>
            取消生成
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {blocks.length} 段 · 待审 {pending}
          {generatingCount > 0 && ` · 生成中 ${generatingCount}`}
          {` · 插入 ${totals.inserted} · 删除 ${totals.deleted}`}
        </span>
        {generated.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={rejectAll}>全部拒绝</Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={acceptAll}>全部采纳</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {blocks.map((block, index) => {
          const segments = block.polishedMarkdown ? (blockDiffs.get(block.blockId) ?? []) : []
          const busy = block.status === 'generating'
          return (
            <div key={block.blockId} className={cn(
              'rounded-md border p-3 transition-colors',
              block.status === 'accepted' && 'border-emerald-500/30 bg-emerald-500/5',
              block.status === 'rejected' && 'border-muted bg-muted/30 opacity-70',
              (block.status === 'failed' || block.status === 'stale') && 'border-amber-500/30 bg-amber-500/5',
            )}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">第 {index + 1} 段</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground/70">{block.blockId}</span>
                {block.status === 'failed' && <span className="text-[10px] text-destructive">失败</span>}
                {block.status === 'stale' && <span className="text-[10px] text-amber-600">已过期</span>}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={batchActive || busy}
                    onClick={() => void generateOne(block, style)}
                  >
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                    {block.polishedMarkdown || block.status === 'failed' || block.status === 'stale' ? '重新生成' : '生成'}
                  </Button>
                  {block.status === 'ready' && (
                    <>
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => rejectOne(block.blockId)}>
                        <XCircle className="size-3" />拒绝
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => acceptOne(block)}>
                        <CheckCircle2 className="size-3" />采纳
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {block.error && (block.status === 'failed' || block.status === 'stale') && (
                <p className="mb-1 text-[11px] text-amber-600">{block.error}</p>
              )}
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {block.polishedMarkdown ? <DiffLineView segments={segments} /> : block.originalMarkdown}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleRestore}>
          <RotateCcw className="size-3.5" />恢复整个原稿
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={handleClose}>结束审阅</Button>
      </div>
    </div>
  )
}

function DiffLineView({ segments }: { segments: DiffSegment[] }) {
  return segments.map((segment, index) => {
    if (segment.op === 'equal') return <span key={index}>{segment.text}</span>
    if (segment.op === 'insert') {
      return <span key={index} className="rounded bg-emerald-500/15 text-emerald-700 underline decoration-emerald-400/40 underline-offset-2 dark:text-emerald-300">{segment.text}</span>
    }
    return <span key={index} className="rounded bg-rose-500/15 text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300">{segment.text}</span>
  })
}
