import { useMemo } from 'react'
import { Check, RefreshCcw, Sparkles, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { computeDiff, type DiffSegment } from '@/lib/text-diff'
import { POLISH_STYLES, polishStyleLabel, type PolishStyleKey } from '@/lib/polish-styles'

export interface DiffPreviewProps {
  original: string
  polished: string
  currentStyle: PolishStyleKey
  loading?: boolean
  onAccept: () => void
  onReject: () => void
  onChangeStyle: (style: PolishStyleKey) => void
  className?: string
}

function DiffInline({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="whitespace-pre-wrap break-words font-[inherit] leading-[inherit]">
      {segments.map((seg, i) => {
        if (seg.op === 'equal') {
          return <span key={i} className="text-foreground">{seg.text}</span>
        }
        if (seg.op === 'delete') {
          return (
            <span
              key={i}
              className="bg-destructive/15 text-destructive line-through decoration-destructive/60"
            >
              {seg.text}
            </span>
          )
        }
        return (
          <span
            key={i}
            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 underline decoration-emerald-500/60 underline-offset-2"
          >
            {seg.text}
          </span>
        )
      })}
    </div>
  )
}

export function DiffPreview({
  original,
  polished,
  currentStyle,
  loading = false,
  onAccept,
  onReject,
  onChangeStyle,
  className,
}: DiffPreviewProps) {
  const segments = useMemo(() => computeDiff(original, polished), [original, polished])

  const stats = useMemo(() => {
    let inserted = 0
    let deleted = 0
    for (const s of segments) {
      if (s.op === 'insert') inserted += [...s.text].length
      else if (s.op === 'delete') deleted += [...s.text].length
    }
    return { inserted, deleted }
  }, [segments])

  return (
    <div className={cn('space-y-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-medium text-primary">AI 润色候选</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {polishStyleLabel(currentStyle)}
          </span>
          {(stats.inserted > 0 || stats.deleted > 0) && (
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {stats.inserted > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                  +{stats.inserted}
                </span>
              )}
              {stats.deleted > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <span className="inline-block size-1.5 rounded-full bg-destructive" />
                  -{stats.deleted}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={loading}
              >
                <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} />
                换风格
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                选择润色风格
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {POLISH_STYLES.map((style) => {
                const active = style.key === currentStyle
                return (
                  <DropdownMenuItem
                    key={style.key}
                    onSelect={() => onChangeStyle(style.key)}
                    className={cn('flex-col items-start gap-0.5', active && 'bg-accent')}
                  >
                    <span className={cn('text-sm', active && 'font-medium')}>
                      {style.label}
                      {active && <Check className="ml-1.5 inline size-3" />}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{style.hint}</span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onReject}
            disabled={loading}
          >
            <X className="size-3.5" />
            放弃
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            onClick={onAccept}
            disabled={loading}
          >
            <Check className="size-3.5" />
            采纳
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-muted-foreground/60" />
            原稿
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background p-3 text-sm leading-6">
            <div className="whitespace-pre-wrap break-words text-muted-foreground">{original}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-primary" />
            润色稿 · Diff
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-primary/20 bg-background p-3 text-sm leading-6">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCcw className="size-3.5 animate-spin" />
                <span className="text-xs">正在用「{polishStyleLabel(currentStyle)}」风格重新生成…</span>
              </div>
            ) : (
              <DiffInline segments={segments} />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-3 rounded-sm bg-destructive/15 align-middle" />
            删除
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-3 rounded-sm bg-emerald-500/15 align-middle" />
            插入
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Undo2 className="size-3" />
          采纳后可再次点击「恢复原稿」一次性撤销整次润色
        </span>
      </div>
    </div>
  )
}
