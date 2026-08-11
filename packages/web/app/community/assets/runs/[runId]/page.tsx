'use client'

import Link from 'next/link'
import { ArrowLeft, Clock, Cpu, GitFork, Loader2, RotateCcw, Share2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRunQuery, useReplayRun, useUpdateRunVisibility, useRemixFromRun } from '@/lib/use-assets'
import { useAuthStore } from '@/lib/store'
import { ApiError } from '@/lib/api'
import { getInitials, formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'

export default function RunDetailPage({ params }: { params: { runId: string } }) {
  const user = useAuthStore((s) => s.user)
  const { data: run, isLoading } = useRunQuery(params.runId)
  const replayMutation = useReplayRun()
  const visibilityMutation = useUpdateRunVisibility(params.runId)
  const remixMutation = useRemixFromRun()

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-muted-foreground">
        运行快照不存在或无权查看
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/community/assets">返回资产列表</Link>
          </Button>
        </div>
      </div>
    )
  }

  const isOwner = user?.id === run.userId

  const handleReplay = async () => {
    try {
      const r = await replayMutation.mutateAsync(params.runId)
      toast.success(`已复现，新运行耗时 ${r.durationMs}ms`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '复现失败')
    }
  }

  const handleShare = async () => {
    try {
      const updated = await visibilityMutation.mutateAsync(
        run.visibility === 'public' ? 'private' : 'public',
      )
      if (updated.visibility === 'public') {
        toast.success('已发布，可分享链接')
      } else {
        toast.success('已撤回分享')
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  const handleRemix = async () => {
    try {
      const newAsset = await remixMutation.mutateAsync({ runId: params.runId, input: {} })
      toast.success('已派生为新资产（草稿）')
      window.location.href = `/community/assets/${newAsset.id}`
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '派生失败')
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={run.asset ? `/community/assets/${run.assetId}` : '/community/assets'}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回资产
        </Link>
      </Button>

      {/* 头部 */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">
                {run.asset?.name ?? '运行快照'}
              </h1>
              {run.status === 'success' ? (
                <Badge variant="secondary" className="text-green-600">成功</Badge>
              ) : (
                <Badge variant="warning">失败</Badge>
              )}
              {run.visibility === 'public' && (
                <Badge variant="outline">已公开</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback>{getInitials(run.user.username)}</AvatarFallback>
                </Avatar>
                <span>{run.user.displayName || run.user.username}</span>
              </div>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(run.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {run.model}
              </span>
              <span>{run.durationMs}ms</span>
              <span>{run.totalTokens} tokens</span>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 flex-wrap">
          {run.status === 'success' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReplay}
              disabled={replayMutation.isPending}
            >
              {replayMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
              一键复现
            </Button>
          )}
          {run.status === 'success' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRemix}
              disabled={remixMutation.isPending}
            >
              {remixMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <GitFork className="h-3.5 w-3.5 mr-1" />}
              派生资产
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleShare}
              disabled={visibilityMutation.isPending}
            >
              <Share2 className="h-3.5 w-3.5 mr-1" />
              {run.visibility === 'public' ? '撤回分享' : '发布分享'}
            </Button>
          )}
        </div>
      </div>

      {/* 输入 */}
      {Object.keys(run.inputs ?? {}).length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-medium">输入</h3>
          <pre className="whitespace-pre-wrap break-words text-xs font-mono bg-muted/50 rounded-md p-3 max-h-64 overflow-auto">
            {JSON.stringify(run.inputs, null, 2)}
          </pre>
        </Card>
      )}

      {/* 输出 */}
      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-medium">
          {run.status === 'success' ? '输出' : '错误信息'}
        </h3>
        <pre className="whitespace-pre-wrap break-words text-sm bg-muted/50 rounded-md p-3 max-h-[32rem] overflow-auto">
          {run.status === 'success' ? (run.output || '(空输出)') : run.errorMessage}
        </pre>
      </Card>
    </div>
  )
}
