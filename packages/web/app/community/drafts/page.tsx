'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Loader2, PenLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import type { Post } from 'shared'

export default function DraftsPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [drafts, setDrafts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (hasHydrated && !token) {
      router.replace('/login?redirect=%2Fcommunity%2Fdrafts')
      return
    }
    if (!token) return
    api
      .get<{ items: Post[] }>('/posts?status=draft&channel=all')
      .then((data) => setDrafts(data.items))
      .catch((e) => toast.error(e instanceof ApiError ? e.message : '草稿加载失败'))
      .finally(() => setLoading(false))
  }, [hasHydrated, token, router])

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
    </div>
  )
}
