'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetCard } from '../components/asset-card'
import { useAssetsQuery } from '@/lib/use-assets'

const PAGE_SIZE = 12

export default function AssetsListPage() {
  const [keyword, setKeyword] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching } = useAssetsQuery({
    keyword: activeKeyword || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveKeyword(keyword)
    setPage(1)
  }

  const items = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">AI 资产</h1>
          <p className="text-sm text-muted-foreground mt-1">
            可复用的 Prompt / Agent / Workflow 模板，一键试玩并派生
          </p>
        </div>
        <Button asChild>
          <Link href="/community/assets/new">
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索资产名或描述"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">搜索</Button>
      </form>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {activeKeyword ? '未找到匹配的资产' : '还没有公开资产，去新建第一个吧'}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
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
                disabled={page === totalPages || isFetching}
              >
                下一页
              </Button>
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
