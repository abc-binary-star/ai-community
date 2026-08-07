'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, KeyRound, Loader2, Search, ShieldCheck, UserCog, X } from 'lucide-react'
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
  const [resetTarget, setResetTarget] = useState<AdminUserItem | null>(null)
  const [resetPwd, setResetPwd] = useState('')
  const [resetPwd2, setResetPwd2] = useState('')
  const [resetting, setResetting] = useState(false)

  const canManage = hasHydrated && !!user && user.role === 'admin'

  const doSearch = async (kw: string) => {
    const trimmed = kw.trim()
    if (!trimmed) {
      toast.info('请输入邮箱或用户名')
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

  const resetPassword = async () => {
    if (!resetTarget) return
    if (resetPwd.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (resetPwd !== resetPwd2) {
      toast.error('两次输入的密码不一致')
      return
    }
    setResetting(true)
    try {
      await api.post(`/users/${encodeURIComponent(resetTarget.username)}/reset-password`, {
        password: resetPwd,
      })
      toast.success(`已重置 ${resetTarget.displayName || resetTarget.username} 的密码，请线下告知新密码`)
      setResetTarget(null)
      setResetPwd('')
      setResetPwd2('')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '重置失败')
    } finally {
      setResetting(false)
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
          按邮箱或用户名搜索（两者均唯一，昵称可能重复），可将其设为管理员 / 版主 / 普通用户、重置密码。
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
            placeholder="输入邮箱或用户名，如：xxx@qq.com"
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resetting}
                    onClick={() => setResetTarget(u)}
                  >
                    <KeyRound className="size-4" />
                    重置密码
                  </Button>
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

      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResetTarget(null)}
        >
          <Card
            className="w-full max-w-sm space-y-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <KeyRound className="size-4 text-primary" />
                重置密码
              </h2>
              <button
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={() => setResetTarget(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              正在为{' '}
              <span className="font-medium text-foreground">
                {resetTarget.displayName || resetTarget.username}
              </span>{' '}
              （@{resetTarget.username}）设置新密码，请线下告知本人。
            </p>
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="新密码（至少 6 位）"
                value={resetPwd}
                onChange={(e) => setResetPwd(e.target.value)}
                autoFocus
              />
              <Input
                type="password"
                placeholder="再次输入新密码"
                value={resetPwd2}
                onChange={(e) => setResetPwd2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') resetPassword()
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResetTarget(null)}>
                取消
              </Button>
              <Button onClick={resetPassword} disabled={resetting}>
                {resetting ? <Loader2 className="animate-spin" /> : null}
                确认重置
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
