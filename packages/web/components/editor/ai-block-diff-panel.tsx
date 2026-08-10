'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, Sparkles, XCircle } from 'lucide-react'
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
  computeDiffStats,
  decideAllAiDiffBlocks,
  pendingAiDiffBlockCount,
  updateAiDiffBlock,
  type AiDiffBlock,
} from '@/lib/ai-diff-workflow'
import { computeDiff, type DiffSegment } from '@/lib/text-diff'
import { captureError, EditorEvents, track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface AiBlockDiffPanelProps {
  initialBlocks: AiDiffBlock[]
  pageType: 'new-post' | 'edit-post'
  postId?: string
  requesting: boolean
  setRequesting: (value: boolean) => void
  onGenerateBlock: (blockId: string, originalMarkdown: string, style: string) => Promise<string>
  onApplyBlock: (blockId: string, polishedMarkdown: string) => boolean
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

export function AiBlockDiffPanel({
  initialBlocks,
  pageType,
  postId,
  requesting,
  setRequesting,
  onGenerateBlock,
  onApplyBlock,
  onRestoreSnapshot,
  onClose,
}: AiBlockDiffPanelProps) {
  const [blocks, setBlocks] = useState(initialBlocks)
  const [style, setStyle] = useState('natural')
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generated = blocks.filter((block) => block.polishedMarkdown)
  const pending = pendingAiDiffBlockCount(blocks)
  const totals = useMemo(() => generated.reduce((acc, block) => {
    const stats = computeDiffStats(computeDiff(block.originalMarkdown, block.polishedMarkdown))
    return { inserted: acc.inserted + stats.inserted, deleted: acc.deleted + stats.deleted }
  }, { inserted: 0, deleted: 0 }), [generated])

  const generateOne = async (block: AiDiffBlock, styleKey: string) => {
    setActiveBlockId(block.blockId)
    setError(null)
    try {
      const polishedMarkdown = await onGenerateBlock(block.blockId, block.originalMarkdown, styleKey)
      setBlocks((current) => updateAiDiffBlock(current, block.blockId, {
        polishedMarkdown,
        status: 'pending',
      }))
      track(EditorEvents.PolishSuccess, { pageType, postId, style: styleKey, blockId: block.blockId })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'AI 润色失败'
      setError(message)
      captureError(reason, { component: 'AiBlockDiffPanel.generateOne', pageType, extra: { postId, blockId: block.blockId } })
      track(EditorEvents.PolishError, { pageType, postId, blockId: block.blockId, error: message })
    } finally {
      setActiveBlockId(null)
    }
  }

  const generateAll = async (styleKey: string) => {
    if (requesting) return
    setRequesting(true)
    setStyle(styleKey)
    track(EditorEvents.PolishStart, { pageType, postId, style: styleKey, scope: 'blocks', count: blocks.length })
    try {
      for (const block of blocks) {
        await generateOne(block, styleKey)
      }
    } finally {
      setRequesting(false)
    }
  }

  const acceptOne = (block: AiDiffBlock) => {
    if (!block.polishedMarkdown) return
    if (!onApplyBlock(block.blockId, block.polishedMarkdown)) {
      setError('无法应用该段修改，原段落可能已经变化')
      return
    }
    setBlocks((current) => updateAiDiffBlock(current, block.blockId, { status: 'accepted' }))
    track(EditorEvents.PolishAccept, { pageType, postId, blockId: block.blockId, style })
  }

  const rejectOne = (blockId: string) => {
    setBlocks((current) => updateAiDiffBlock(current, blockId, { status: 'rejected' }))
    track(EditorEvents.PolishReject, { pageType, postId, blockId })
  }

  const acceptAll = () => {
    let success = true
    for (const block of blocks) {
      if (block.status === 'pending' && block.polishedMarkdown) {
        success = onApplyBlock(block.blockId, block.polishedMarkdown) && success
      }
    }
    if (!success) setError('部分段落未能应用，可能已被编辑')
    setBlocks((current) => decideAllAiDiffBlocks(current, 'accepted'))
    track(EditorEvents.PolishAccept, { pageType, postId, style, scope: 'all-blocks' })
  }

  const rejectAll = () => {
    setBlocks((current) => decideAllAiDiffBlocks(current, 'rejected'))
    track(EditorEvents.PolishReject, { pageType, postId, scope: 'all-blocks' })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" disabled={requesting} className="h-8 gap-1.5 text-xs">
              {requesting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
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
        <span className="text-xs text-muted-foreground">
          {blocks.length} 段 · 待审 {pending} · 插入 {totals.inserted} · 删除 {totals.deleted}
        </span>
        {generated.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={rejectAll}>全部拒绝</Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={acceptAll}>全部采纳</Button>
          </div>
        )}
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {blocks.map((block, index) => {
          const segments = block.polishedMarkdown ? computeDiff(block.originalMarkdown, block.polishedMarkdown) : []
          const busy = activeBlockId === block.blockId
          return (
            <div key={block.blockId} className={cn(
              'rounded-md border p-3 transition-colors',
              block.status === 'accepted' && 'border-emerald-500/30 bg-emerald-500/5',
              block.status === 'rejected' && 'border-muted bg-muted/30 opacity-70',
            )}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">第 {index + 1} 段</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground/70">{block.blockId}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={requesting || busy} onClick={() => void generateOne(block, style)}>
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                    {block.polishedMarkdown ? '重新生成' : '生成'}
                  </Button>
                  {block.polishedMarkdown && block.status === 'pending' && (
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
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {block.polishedMarkdown ? <DiffLineView segments={segments} /> : block.originalMarkdown}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={onRestoreSnapshot}>
          <RotateCcw className="size-3.5" />恢复整个原稿
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onClose}>结束审阅</Button>
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
