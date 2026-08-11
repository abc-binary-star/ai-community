'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Search, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetCard } from '../components/asset-card'
import { useAssetsQuery, useAssetTagsQuery } from '@/lib/use-assets'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 12

type SortMode = 'latest' | 'hot' | 'forks'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '热门' },
  { value: 'forks', label: '最多派生' },
]

export default function AssetsListPage() {
  const [keyword, setKeyword] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [sort, setSort] = useState<SortMode>('latest')
  const [activeTag, setActiveTag] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching } = useAssetsQuery({
    keyword: activeKeyword || undefined,
    tag: activeTag || undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
  })

  const { data: tagStats } = useAssetTagsQuery(20)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveKeyword(keyword)
    setPage(1)
  }

  const handleSort = (mode: SortMode) => {
    setSort(mode)
    setPage(1)
  }

  const handleTag = (tag: string) => {
    setActiveTag(activeTag === tag ? '' : tag)
    setPage(1)
  }

  const items = data?.items ?? []
  const totalPages = data?.totalPages ?? 1
  const tags = tagStats ?? []

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

      {/* 搜索 + 排序（C1） */}
      <div className="flex flex-col gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索资产名、描述或模板"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">搜索</Button>
        </form>

        <div className="flex items-center gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSort(opt.value)}
              className={cn(
                'rounded-full px-3 py-1 text-sm transition-colors',
                sort === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 标签筛选（C1） */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => handleTag(tag)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                activeTag === tag
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary',
              )}
            >
              <Tag className="h-3 w-3" />
              {tag}
              <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {activeKeyword || activeTag
            ? '未找到匹配的资产'
            : '还没有公开资产，去新建第一个吧'}
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
