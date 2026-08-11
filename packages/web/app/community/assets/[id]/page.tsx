'use client'

import Link from 'next/link'
import { ArrowLeft, Box, GitFork, Loader2, Play, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssetQuery, useDeleteAsset, useAssetRunsQuery, useUpdateAsset, useRemixFromRun } from '@/lib/use-assets'
import { useAuthStore } from '@/lib/store'
import { ApiError } from '@/lib/api'
import { getInitials, formatRelativeTime } from '@/lib/utils'
import { AssetRunDialog } from '../../components/asset-run-dialog'
import { toast } from 'sonner'
import { useState } from 'react'

export default function AssetDetailPage({ params }: { params: { id: string } }) {
  const user = useAuthStore((s) => s.user)
  const { data: asset, isLoading } = useAssetQuery(params.id)
  const deleteMutation = useDeleteAsset()
  const updateMutation = useUpdateAsset(params.id)
  const remixMutation = useRemixFromRun()
  const [remixing, setRemixing] = useState(false)

  // 运行历史（仅作者可看全部；非作者后端只返回 public 快照）
  const { data: runsData } = useAssetRunsQuery(params.id, 1, 5)

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-muted-foreground">
        资产不存在或无权查看
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/community/assets">返回列表</Link>
          </Button>
        </div>
      </div>
    )
  }

  const isAuthor = user?.id === asset.authorId

  const handleDelete = async () => {
    if (!window.confirm(`确定删除资产「${asset.name}」吗？此操作不可恢复。`)) return
    try {
      await deleteMutation.mutateAsync(asset.id)
      toast.success('已删除')
      window.location.href = '/community/assets'
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  const handlePublish = async () => {
    try {
      await updateMutation.mutateAsync({ status: 'published' })
      toast.success('已发布')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '发布失败')
    }
  }

  const handleArchive = async () => {
    try {
      await updateMutation.mutateAsync({ status: 'archived' })
      toast.success('已归档')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '归档失败')
    }
  }

  const handleRemix = async (runId: string) => {
    setRemixing(true)
    try {
      const newAsset = await remixMutation.mutateAsync({ runId, input: {} })
      toast.success('已派生为新资产（草稿）')
      window.location.href = `/community/assets/${newAsset.id}`
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '派生失败')
    } finally {
      setRemixing(false)
    }
  }

  const runs = runsData?.items ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/community/assets">
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回列表
        </Link>
      </Button>

      {/* 头部 */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{asset.name}</h1>
              <Badge variant="secondary">v{asset.version}</Badge>
              {asset.status === 'draft' && <Badge variant="outline">草稿</Badge>}
              {asset.status === 'archived' && <Badge variant="outline">已归档</Badge>}
              {asset.parentId && (
                <Badge variant="outline" className="gap-1">
                  <GitFork className="h-3 w-3" />
                  派生
                </Badge>
              )}
            </div>
            {asset.description && (
              <p className="text-sm text-muted-foreground mt-2">{asset.description}</p>
            )}
          </div>
          {isAuthor && (
            <div className="flex items-center gap-1 shrink-0">
              {asset.status === 'draft' && (
                <Button size="sm" onClick={handlePublish} disabled={updateMutation.isPending}>
                  发布
                </Button>
              )}
              {asset.status === 'published' && (
                <Button size="sm" variant="outline" onClick={handleArchive} disabled={updateMutation.isPending}>
                  归档
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* 作者与统计 */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback>{getInitials(asset.author.username)}</AvatarFallback>
            </Avatar>
            <span>{asset.author.displayName || asset.author.username}</span>
          </div>
          <span className="flex items-center gap-1">
            <Play className="h-3 w-3" />
            {asset.runCount}
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="h-3 w-3" />
            {asset.forkCount}
          </span>
          <span>{formatRelativeTime(asset.createdAt)}</span>
        </div>
      </div>

      {/* Prompt 模板 */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Box className="h-4 w-4" />
          Prompt 模板
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-muted/50 rounded-md p-3 max-h-96 overflow-auto">
          {asset.promptTemplate}
        </pre>
        {asset.inputVariables?.length > 0 && (
          <div className="text-xs text-muted-foreground">
            输入变量：
            {asset.inputVariables.map((v) => v.name).join(', ')}
          </div>
        )}
      </Card>

      {/* 试玩区（B3） */}
      <Card className="p-4">
        <AssetRunDialog asset={asset} />
      </Card>

      {/* 运行历史（B4） */}
      {runs.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">最近运行</h3>
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-start justify-between gap-2 p-2 rounded-md hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={run.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                      {run.status === 'success' ? '成功' : '失败'}
                    </span>
                    <span className="text-muted-foreground">{run.model}</span>
                    <span className="text-muted-foreground">{run.durationMs}ms</span>
                    <span className="text-muted-foreground">{run.totalTokens} tokens</span>
                    {run.visibility === 'public' && (
                      <Badge variant="outline" className="text-xs">已公开</Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1 line-clamp-2 text-muted-foreground">
                    {run.output || run.errorMessage || '(空)'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/community/assets/runs/${run.id}`}>查看</Link>
                  </Button>
                  {run.status === 'success' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemix(run.id)}
                      disabled={remixing}
                    >
                      {remixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
                      派生
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
