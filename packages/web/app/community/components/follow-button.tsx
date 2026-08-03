'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, UserCheck, UserPlus, Users } from 'lucide-react'
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
import type { FollowGroup } from 'shared'

interface Props {
  username: string
  isFollowing: boolean
  className?: string
  onChanged?: (next: { isFollowing: boolean }) => void
}

export function FollowButton({ username, isFollowing, className, onChanged }: Props) {
  const token = useAuthStore((s) => s.token)
  const [state, setState] = useState(isFollowing)
  const [submitting, setSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // 拉取关注分组（关注时供用户选择归类）
  const groupsQuery = useQuery({
    queryKey: ['follow-groups'],
    queryFn: () => api.get<{ items: FollowGroup[] }>('/follow-groups'),
    enabled: !!token,
  })

  useEffect(() => {
    setState(isFollowing)
  }, [isFollowing])

  const doFollow = async (next: boolean, groupId?: string) => {
    if (submitting) return
    setSubmitting(true)
    const prev = state
    setState(next)
    try {
      if (next) {
        const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''
        await api.post(`/users/${encodeURIComponent(username)}/follow${qs}`)
      } else {
        await api.del(`/users/${encodeURIComponent(username)}/follow`)
      }
      onChanged?.({ isFollowing: next })
    } catch (e) {
      setState(prev)
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClick = async () => {
    if (!token) {
      toast.info('登录后即可关注')
      return
    }
    if (state) {
      await doFollow(false)
      return
    }
    const groups = groupsQuery.data?.items
    if (groups && groups.length > 0) {
      setMenuOpen(true)
      return
    }
    await doFollow(true)
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting}
          aria-pressed={state}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg text-sm font-medium transition-colors',
            state
              ? 'border border-border bg-background text-foreground hover:bg-accent'
              : 'bg-primary text-primary-foreground hover:opacity-90',
            'h-9 px-3',
            submitting && 'opacity-60',
            className,
          )}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state ? (
            <UserCheck className="size-4" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {state ? '已关注' : '关注'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>关注并分组</DropdownMenuLabel>
        {groupsQuery.isLoading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false)
                void doFollow(true, '')
              }}
            >
              <Users className="size-4" />
              不分组
            </DropdownMenuItem>
            {groupsQuery.data && groupsQuery.data.items.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {groupsQuery.data.items.map((g) => (
                  <DropdownMenuItem
                    key={g.id}
                    onClick={() => {
                      setMenuOpen(false)
                      void doFollow(true, g.id)
                    }}
                  >
                    <Users className="size-4" />
                    {g.name}
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
