'use client'

import { useMemo } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// 简单行级 diff：将原文和润色结果按行拆分，标记新增/删除/不变
interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

function computeDiff(original: string, rewritten: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = rewritten.split('\n')
  const result: DiffLine[] = []

  // 简单 LCS 行对比
  const m = oldLines.length
  const n = newLines.length
  // dp[i][j] = LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // 回溯生成 diff
  let i = 0, j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', text: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'del', text: oldLines[i] })
      i++
    } else {
      result.push({ type: 'add', text: newLines[j] })
      j++
    }
  }
  while (i < m) {
    result.push({ type: 'del', text: oldLines[i++] })
  }
  while (j < n) {
    result.push({ type: 'add', text: newLines[j++] })
  }

  return result
}

export interface DiffPanelProps {
  original: string
  rewritten: string
  onAccept: () => void
  onReject: () => void
  loading?: boolean
}

export function DiffPanel({ original, rewritten, onAccept, onReject, loading }: DiffPanelProps) {
  const diffLines = useMemo(() => computeDiff(original, rewritten), [original, rewritten])
  const hasChanges = diffLines.some((l) => l.type !== 'same')

  return (
    <Card className="border-primary/30 shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">AI 润色对比</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onReject} disabled={loading}>
            <X className="size-3" />
            放弃
          </Button>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={onAccept} disabled={loading || !hasChanges}>
            {loading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            采纳
          </Button>
        </div>
      </div>
      <div className="max-h-[400px] overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            AI 润色中…
          </div>
        ) : !hasChanges ? (
          <div className="py-8 text-center text-sm text-muted-foreground">AI 认为不需要修改</div>
        ) : (
          <pre className="text-xs leading-5">
            {diffLines.map((line, idx) => (
              <div
                key={idx}
                className={`px-4 py-0.5 font-mono ${
                  line.type === 'add'
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                    : line.type === 'del'
                      ? 'bg-red-500/10 text-red-700 dark:text-red-400 line-through opacity-70'
                      : ''
                }`}
              >
                <span className="mr-2 select-none opacity-40">
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                </span>
                {line.text || ' '}
              </div>
            ))}
          </pre>
        )}
      </div>
    </Card>
  )
}
