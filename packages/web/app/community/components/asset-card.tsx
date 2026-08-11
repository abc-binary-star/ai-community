'use client'

import Link from 'next/link'
import { Box, GitFork, Play, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { useDeleteAsset } from '@/lib/use-assets'
import { useAuthStore } from '@/lib/store'
import type { Asset } from 'shared'
import { toast } from 'sonner'

interface AssetCardProps {
  asset: Asset
  /** 是否展示「试玩」按钮（列表页默认展示，个人中心可关闭） */
  showRunEntry?: boolean
}

export function AssetCard({ asset, showRunEntry = true }: AssetCardProps) {
  const user = useAuthStore((s) => s.user)
  const deleteMutation = useDeleteAsset()
  const isAuthor = user?.id === asset.authorId

  const handleDelete = async () => {
    if (!window.confirm(`确定删除资产「${asset.name}」吗？此操作不可恢复。`)) return
    try {
      await deleteMutation.mutateAsync(asset.id)
      toast.success('已删除')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>{getInitials(asset.author.username)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/community/assets/${asset.id}`}
              className="font-semibold hover:underline truncate"
            >
              {asset.name}
            </Link>
            <Badge variant="secondary" className="text-xs">
              v{asset.version}
            </Badge>
            {asset.status === 'draft' && (
              <Badge variant="outline" className="text-xs">
                草稿
              </Badge>
            )}
            {asset.visibility === 'unlisted' && (
              <Badge variant="outline" className="text-xs">
                不列入列表
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {asset.description || '暂无描述'}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <Box className="h-3 w-3" />
              {asset.type}
            </span>
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              {asset.runCount} 次运行
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="h-3 w-3" />
              {asset.forkCount} 次派生
            </span>
            <span>{formatRelativeTime(asset.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showRunEntry && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/community/assets/${asset.id}#run`}>试玩</Link>
            </Button>
          )}
          {isAuthor && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
