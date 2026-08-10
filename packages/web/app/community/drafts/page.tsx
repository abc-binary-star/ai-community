'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, FileText, Loader2, PenLine, Trash2, HardDrive, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import type { Paginated, Post } from 'shared'
import {
  listUserNewDrafts,
  deleteDraftFromDB,
  type LocalDraft,
} from '@/lib/draft-storage'

const PAGE_SIZE = 20

export default function DraftsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [drafts, setDrafts] = useState<Post[]>([])
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLocal, setLoadingLocal] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingLocalId, setDeletingLocalId] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(1)

  const userId = user?.id ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  useEffect(() => {
    if (hasHydrated && !token) {
      router.replace('/login?redirect=%2Fcommunity%2Fdrafts')
      return
    }
    if (!token) return
    api
      .get<Paginated<Post>>(`/posts?status=draft&channel=all&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((data) => {
        setDrafts(data.items)
        setTotalPages(data.totalPages ?? 1)
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : '草稿加载失败'))
      .finally(() => setLoading(false))
  }, [hasHydrated, token, router, page])

  useEffect(() => {
    if (!userId) return
    listUserNewDrafts(userId)
      .then((list) => setLocalDrafts(list))
      .catch(() => setLocalDrafts([]))
      .finally(() => setLoadingLocal(false))
  }, [userId])

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除这篇草稿吗？此操作不可撤销。')) return
    setDeletingId(id)
    try {
      await api.del(`/posts/${id}`)
      setDrafts((prev) => prev.filter((d) => d.id !== id))
      toast.success('草稿已删除')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteLocal = async (id: string) => {
    if (!window.confirm('确定删除这篇本地草稿吗？仅删除本地副本。')) return
    setDeletingLocalId(id)
    try {
      await deleteDraftFromDB(id)
      setLocalDrafts((prev) => prev.filter((d) => d.id !== id))
      sessionStorage.removeItem(`new-draft:${userId}`)
      toast.success('本地草稿已删除')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingLocalId(null)
    }
  }

  if (!hasHydrated || !token || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <FileText className="size-5 text-muted-foreground" />
          我的草稿
        </h1>
        <Button asChild size="sm">
          <Link href="/community/post/new">
            <PenLine />
            写新帖
          </Link>
        </Button>
      </div>

      {localDrafts.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Database className="size-4" />
            <span>本地草稿（未同步服务器）</span>
          </div>
          {loadingLocal ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 size-6 animate-spin opacity-50" />
              正在加载本地草稿…
            </div>
          ) : (
            <ul className="space-y-2">
              {localDrafts.map((d) => (
                <li
                  key={d.id}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-amber-200/60 bg-amber-50/40 px-4 py-3 transition-colors hover:border-amber-300 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:border-amber-500/40"
                >
                  <Link href="/community/post/new" className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <HardDrive className="size-3 text-amber-600 dark:text-amber-400" />
                      <p className="truncate font-medium">
                        {d.title.trim() ? d.title : <span className="text-muted-foreground">无标题本地草稿</span>}
                      </p>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{d.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      更新于 {new Date(d.updatedAt).toLocaleString()}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="继续编辑（会恢复本地草稿）"
                    >
                      <Link href="/community/post/new">
                        <PenLine className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title="删除本地草稿"
                      disabled={deletingLocalId === d.id}
                      onClick={() => handleDeleteLocal(d.id)}
                    >
                      {deletingLocalId === d.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" />
          <span>服务器草稿</span>
        </div>
        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 size-8 opacity-50" />
            还没有草稿，写一半的内容可以先存草稿
          </div>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/30"
              >
                <Link href={`/community/post/${d.id}/edit`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {d.title.trim() ? d.title : <span className="text-muted-foreground">无标题草稿</span>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{d.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">更新于 {new Date(d.updatedAt).toLocaleString()}</p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="icon" className="size-8" title="继续编辑">
                    <Link href={`/community/post/${d.id}/edit`}>
                      <PenLine className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    title="删除草稿"
                    disabled={deletingId === d.id}
                    onClick={() => handleDelete(d.id)}
                  >
                    {deletingId === d.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* 服务器草稿分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('page', String(page - 1))
                router.push(`/community/drafts?${params.toString()}`)
              }}
            >
              <ChevronLeft />
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('page', String(page + 1))
                router.push(`/community/drafts?${params.toString()}`)
              }}
            >
              下一页
              <ChevronRight />
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
