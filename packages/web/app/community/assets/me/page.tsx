'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetCard } from '../../components/asset-card'
import { useMyAssetsQuery } from '@/lib/use-assets'
import { useAuthStore } from '@/lib/store'

const PAGE_SIZE = 12

export default function MyAssetsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [page, setPage] = useState(1)

  // 未登录跳转
  useEffect(() => {
    if (hasHydrated && !user) {
      router.replace('/login?redirect=%2Fcommunity%2Fassets%2Fme')
    }
  }, [hasHydrated, user, router])

  const { data, isLoading } = useMyAssetsQuery(page, PAGE_SIZE)

  if (hasHydrated && !user) return null

  const items = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的资产</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理你创建的 Prompt / Agent / Workflow
          </p>
        </div>
        <Button asChild>
          <Link href="/community/assets/new">
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          你还没有创建资产，<Link href="/community/assets/new" className="underline">去新建第一个</Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((asset) => (
              <AssetCard key={asset.id} asset={asset} showRunEntry={false} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
