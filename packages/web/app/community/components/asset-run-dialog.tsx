'use client'

import { useEffect, useState } from 'react'
import { Loader2, Play, RotateCcw, Share2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  useRunAsset,
  useReplayRun,
  useUpdateRunVisibility,
} from '@/lib/use-assets'
import { ApiError } from '@/lib/api'
import type { Asset } from 'shared'
import { toast } from 'sonner'

interface AssetRunDialogProps {
  asset: Asset
  /** 滚动到此组件时自动滚动到顶部，用于详情页 #run 锚点 */
  autoFocus?: boolean
}

export function AssetRunDialog({ asset, autoFocus = false }: AssetRunDialogProps) {
  // 根据资产的 inputVariables 声明动态生成表单初值
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [result, setResult] = useState<{
    output: string
    model: string
    runId: string
    durationMs: number
    totalTokens: number
    visibility: 'private' | 'public'
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const runMutation = useRunAsset(asset.id)
  const replayMutation = useReplayRun()
  const visibilityMutation = useUpdateRunVisibility(result?.runId ?? '')

  // 初始化输入：用 default 填充
  useEffect(() => {
    const init: Record<string, unknown> = {}
    for (const v of asset.inputVariables ?? []) {
      if (v.default !== undefined) init[v.name] = v.default
      else if (v.type === 'select' && v.options?.length) init[v.name] = v.options[0]
      else init[v.name] = ''
    }
    setInputs(init)
  }, [asset.id, asset.inputVariables])

  const handleRun = async () => {
    setResult(null)
    try {
      const r = await runMutation.mutateAsync({ inputs })
      setResult({
        output: r.output,
        model: r.model,
        runId: r.runId,
        durationMs: r.durationMs,
        totalTokens: r.usage.totalTokens,
        visibility: 'private',
      })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '运行失败，请稍后重试')
    }
  }

  const handleReplay = async () => {
    if (!result?.runId) return
    try {
      const r = await replayMutation.mutateAsync(result.runId)
      setResult({
        output: r.output,
        model: r.model,
        runId: r.runId,
        durationMs: r.durationMs,
        totalTokens: r.usage.totalTokens,
        visibility: 'private',
      })
      toast.success('已复现')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '复现失败')
    }
  }

  const handleShare = async () => {
    if (!result?.runId) return
    try {
      const updated = await visibilityMutation.mutateAsync(
        result.visibility === 'public' ? 'private' : 'public',
      )
      setResult({ ...result, visibility: updated.visibility })
      if (updated.visibility === 'public') {
        toast.success('已发布，可分享链接')
      } else {
        toast.success('已撤回分享')
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  const handleCopy = async () => {
    if (!result?.output) return
    await navigator.clipboard.writeText(result.output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isLoading = runMutation.isPending || replayMutation.isPending
  const hasResult = !!result

  return (
    <div id="run" className="space-y-4" tabIndex={-1}>
      <div className="flex items-center gap-2">
        <Play className="h-5 w-5" />
        <h3 className="font-semibold">试玩</h3>
      </div>

      {/* 动态输入表单 */}
      {asset.inputVariables?.length > 0 ? (
        <div className="space-y-3">
          {asset.inputVariables.map((v) => (
            <div key={v.name} className="space-y-1.5">
              <Label htmlFor={`var-${v.name}`}>
                {v.label || v.name}
                {v.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {v.description && (
                <p className="text-xs text-muted-foreground">{v.description}</p>
              )}
              {v.type === 'select' ? (
                <select
                  id={`var-${v.name}`}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={String(inputs[v.name] ?? '')}
                  onChange={(e) => setInputs({ ...inputs, [v.name]: e.target.value })}
                >
                  {v.options?.map((opt) => (
                    <option key={String(opt)} value={String(opt)}>
                      {String(opt)}
                    </option>
                  ))}
                </select>
              ) : v.type === 'boolean' ? (
                <Input
                  id={`var-${v.name}`}
                  type="checkbox"
                  checked={!!inputs[v.name]}
                  onChange={(e) => setInputs({ ...inputs, [v.name]: e.target.checked })}
                  className="h-4 w-4"
                />
              ) : (
                <Textarea
                  id={`var-${v.name}`}
                  value={String(inputs[v.name] ?? '')}
                  onChange={(e) =>
                    setInputs({ ...inputs, [v.name]: e.target.value })
                  }
                  rows={v.type === 'number' ? 1 : 3}
                  placeholder={`请输入${v.label || v.name}`}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">该资产无输入变量，直接运行即可。</p>
      )}

      <Button onClick={handleRun} disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
        运行
      </Button>

      {/* 运行结果 */}
      {hasResult && result && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {result.model} · {result.durationMs}ms · {result.totalTokens} tokens
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={handleReplay} disabled={isLoading}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                复现
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleShare}
                disabled={visibilityMutation.isPending}
              >
                <Share2 className="h-3.5 w-3.5 mr-1" />
                {result.visibility === 'public' ? '撤回分享' : '分享'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
          </div>
          <pre className={cn(
            'whitespace-pre-wrap break-words text-sm',
            'bg-muted/50 rounded-md p-3 max-h-96 overflow-auto',
          )}>
            {result.output || '(空输出)'}
          </pre>
          {result.visibility === 'public' && (
            <p className="text-xs text-muted-foreground">
              已公开，分享链接：{typeof window !== 'undefined' ? window.location.origin : ''}/community/assets/runs/{result.runId}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
