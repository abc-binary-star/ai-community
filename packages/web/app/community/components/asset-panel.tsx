'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Box, Plus, Play, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/lib/store'
import {
  usePostAssetsQuery,
  useBindPostAsset,
  useUnbindPostAsset,
} from '@/lib/use-assets'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Post } from 'shared'
import { toast } from 'sonner'

interface AssetPanelProps {
  post: Post
}

export function AssetPanel({ post }: AssetPanelProps) {
  const user = useAuthStore((s) => s.user)
  const isAuthor = user?.id === post.authorId
  const [binding, setBinding] = useState(false)
  const [assetIdInput, setAssetIdInput] = useState('')

  const { data, isLoading } = usePostAssetsQuery(post.id)
  const bindMutation = useBindPostAsset(post.id)
  const unbindMutation = useUnbindPostAsset(post.id)

  const items = data?.items ?? []

  const handleBind = async () => {
    if (!assetIdInput.trim()) return
    try {
      await bindMutation.mutateAsync({ assetId: assetIdInput.trim() })
      setAssetIdInput('')
      setBinding(false)
      toast.success('已绑定')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '绑定失败')
    }
  }

  const handleUnbind = async (assetId: string) => {
    if (!window.confirm('确定解绑此资产吗？')) return
    try {
      await unbindMutation.mutateAsync(assetId)
      toast.success('已解绑')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '解绑失败')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4" />
          <h3 className="font-semibold text-sm">本帖使用的 AI 资产</h3>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">{items.length}</span>
          )}
        </div>
        {isAuthor && !binding && (
          <Button size="sm" variant="ghost" onClick={() => setBinding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            绑定
          </Button>
        )}
      </div>

      {binding && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入资产 ID"
            value={assetIdInput}
            onChange={(e) => setAssetIdInput(e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            onClick={handleBind}
            disabled={bindMutation.isPending || !assetIdInput.trim()}
          >
            {bindMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '确定'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBinding(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">暂无绑定的资产</p>
      ) : (
        <div className="space-y-2">
          {items.map((pa) => (
            <Card key={pa.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/community/assets/${pa.assetId}`}
                    className="font-medium text-sm hover:underline truncate block"
                  >
                    {pa.asset.name}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {pa.asset.description || '暂无描述'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    v{pa.asset.version} · {pa.asset.type} · {pa.asset.runCount} 次运行
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/community/assets/${pa.assetId}#run`}>
                      <Play className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {isAuthor && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnbind(pa.assetId)}
                      disabled={unbindMutation.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
