'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Search, ShieldCheck, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { getInitials } from '@/lib/utils'

interface AdminUserItem {
  id: string
  username: string
  avatar: string | null
  displayName: string | null
  email: string
  role: string
  createdAt: string
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'moderator', label: '版主' },
  { value: 'user', label: '普通用户' },
] as const

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  moderator: '版主',
  user: '普通用户',
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return <Badge className="border-transparent bg-red-500/10 text-red-600">管理员</Badge>
  }
  if (role === 'moderator') {
    return <Badge className="border-transparent bg-blue-500/10 text-blue-600">版主</Badge>
  }
  return <Badge variant="secondary">普通用户</Badge>
}

const selectClass =
  'h-9 w-28 rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export default function UserRoleAdminPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AdminUserItem[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const canManage = hasHydrated && !!user && user.role === 'admin'

  const doSearch = async (kw: string) => {
    const trimmed = kw.trim()
    if (!trimmed) {
      toast.info('请输入用户名或显示名')
      return
    }
    setSearching(true)
    try {
      const data = await api.get<{ items: AdminUserItem[] }>(
        `/users/admin/role-management/search?q=${encodeURIComponent(trimmed)}`,
      )
      setItems(data.items ?? [])
      setSearched(true)
      setDrafts({})
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  const saveRole = async (username: string, role: string) => {
    setSaving(username)
    try {
      await api.put(`/users/${encodeURIComponent(username)}/role`, { role })
      toast.success(`已将 ${username} 设为${ROLE_LABELS[role] ?? role}`)
      setItems((prev) => prev.map((u) => (u.username === username ? { ...u, role } : u)))
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[username]
        return next
      })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '设置失败')
    } finally {
      setSaving(null)
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="text-muted-foreground">仅管理员可管理用户角色</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community/discover">返回社区</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <UserCog className="size-5 text-primary" />
          用户管理
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按用户名或显示名搜索用户，可将其设为管理员 / 版主 / 普通用户。
        </p>
      </div>

      <Card className="p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            doSearch(query)
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入用户名或显示名，如：栗悟饭与龟波功"
            className="flex-1"
          />
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="animate-spin" /> : <Search />}
            搜索
          </Button>
        </form>
      </Card>

      {searched && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">未找到匹配的用户</p>
      )}

      <div className="space-y-2">
        {items.map((u) => {
          const isSelf = u.id === user?.id
          const draft = drafts[u.username] ?? u.role
          const dirty = draft !== u.role
          return (
            <Card key={u.id} className="flex items-center gap-3 p-3">
              <Avatar className="size-9">
                {u.avatar ? <AvatarImage src={u.avatar} alt={u.username} /> : null}
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {getInitials(u.displayName || u.username)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="max-w-[10rem] truncate text-sm font-medium">
                    {u.displayName || u.username}
                  </span>
                  <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
                    @{u.username}
                  </span>
                  <RoleBadge role={u.role} />
                </div>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              {isSelf ? (
                <span className="shrink-0 text-xs text-muted-foreground">不能修改自己的角色</span>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className={selectClass}
                    value={draft}
                    disabled={saving === u.username}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [u.username]: e.target.value }))
                    }
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {dirty && (
                    <Button
                      size="sm"
                      disabled={saving === u.username}
                      onClick={() => saveRole(u.username, draft)}
                    >
                      {saving === u.username ? <Loader2 className="animate-spin" /> : null}
                      保存
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
