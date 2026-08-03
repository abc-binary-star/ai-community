'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bookmark, BookmarkMinus, Folder, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { BookmarkFolder } from 'shared'

interface Props {
  id: string
  bookmarked: boolean
  size?: 'sm' | 'md'
  onChanged?: (next: { bookmarked: boolean }) => void
  className?: string
}

export function BookmarkButton({ id, bookmarked, size = 'sm', onChanged, className }: Props) {
  const token = useAuthStore((s) => s.token)
  const [state, setState] = useState(bookmarked)
  const [submitting, setSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // 拉取收藏夹列表（收藏时供用户选择归类）
  const foldersQuery = useQuery({
    queryKey: ['bookmark-folders'],
    queryFn: () => api.get<{ items: BookmarkFolder[] }>('/bookmarks/folders'),
    enabled: !!token,
  })

  useEffect(() => {
    setState(bookmarked)
  }, [bookmarked])

  // 执行收藏/取消收藏
  const doBookmark = async (next: boolean, folderId?: string) => {
    if (submitting) return
    setSubmitting(true)
    const prev = state
    setState(next)
    try {
      if (next) {
        const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
        await api.post(`/posts/${id}/bookmark${qs}`)
      } else {
        await api.del(`/posts/${id}/bookmark`)
      }
      onChanged?.({ bookmarked: next })
    } catch (e) {
      setState(prev)
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 点击主按钮：已收藏 → 弹出菜单（取消收藏 / 移动）；未收藏 → 有收藏夹则弹出选择，无则直接收藏
  const handleClick = async () => {
    if (!token) {
      toast.info('登录后即可收藏')
      return
    }
    if (state) {
      setMenuOpen(true)
      return
    }
    const folders = foldersQuery.data?.items
    if (folders && folders.length > 0) {
      setMenuOpen(true)
      return
    }
    await doBookmark(true)
  }

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'
  const padX = size === 'sm' ? 'px-2 h-7' : 'px-3 h-9'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting}
          aria-pressed={state}
          aria-label={state ? '取消收藏' : '收藏'}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg font-medium transition-colors',
            padX,
            textSize,
            state
              ? 'text-amber-500 hover:bg-amber-50'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            submitting && 'opacity-60',
            className,
          )}
        >
          {submitting ? (
            <Loader2 className={cn(iconSize, 'animate-spin')} />
          ) : (
            <Bookmark className={cn(iconSize, state && 'fill-current')} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{state ? '移动收藏到' : '收藏到'}</DropdownMenuLabel>
        {foldersQuery.isLoading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            {state ? (
              <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false)
                  void doBookmark(false)
                }}
              >
                <BookmarkMinus className="size-4" />
                取消收藏
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false)
                  void doBookmark(true, '')
                }}
              >
                <Bookmark className="size-4" />
                默认收藏
              </DropdownMenuItem>
            )}
            {foldersQuery.data && foldersQuery.data.items.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {foldersQuery.data.items.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={() => {
                      setMenuOpen(false)
                      void doBookmark(true, f.id)
                    }}
                  >
                    <Folder className="size-4" />
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
