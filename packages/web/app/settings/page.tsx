'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Bell, Loader2, Save, ShieldOff, User } from 'lucide-react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { CommunityShell } from '@/app/community/components/community-shell'
import { cn, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { NotificationPreference, Paginated, PublicUser, User as UserType } from 'shared'

// 轻量开关组件：蓝色圆角滑块
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-muted-foreground/25',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()

  const [avatar, setAvatar] = useState(user?.avatar || '')
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [bio, setBio] = useState(user?.bio || '')

  const mutation = useMutation({
    mutationFn: (data: { avatar: string; displayName: string; bio: string }) =>
      api.put<UserType>('/users/me', data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser)
      // 用户主页缓存的是 PublicUser（含 postCount/followerCount 等），
      // 与此处返回的 User 类型不同，应 invalidate 让其重新拉取，而非写入错误类型
      queryClient.invalidateQueries({ queryKey: ['user', user?.username] })
      queryClient.invalidateQueries({ queryKey: ['user-posts', user?.username] })
      toast.success('资料已更新')
      router.refresh()
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : '保存失败')
    },
  })

  // 屏蔽管理：我的拉黑列表
  const blockedQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => api.get<Paginated<PublicUser>>('/users/me/blocked?page=1&pageSize=50'),
    enabled: !!token,
  })
  const unblockMutation = useMutation({
    mutationFn: (username: string) => api.del<void>(`/users/${encodeURIComponent(username)}/block`),
    onSuccess: () => {
      toast.success('已解除拉黑')
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  // 通知偏好
  const prefsQuery = useQuery({
    queryKey: ['notif-prefs'],
    queryFn: () => api.get<NotificationPreference>('/notifications/preferences'),
    enabled: !!token,
  })
  const prefsMutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreference>) =>
      api.put<NotificationPreference>('/notifications/preferences', patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-prefs'] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '保存失败'),
  })
  const updatePref = (patch: Partial<NotificationPreference>) => prefsMutation.mutate(patch)

  if (!hydrated) {
    return (
      <CommunityShell>
        <div className="mx-auto max-w-md py-20 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        </div>
      </CommunityShell>
    )
  }

  if (!token || !user) {
    return (
      <CommunityShell>
        <div className="mx-auto max-w-md py-20 text-center">
          <p className="text-muted-foreground">请先登录</p>
          <Button asChild className="mt-4">
            <Link href="/login">去登录</Link>
          </Button>
        </div>
      </CommunityShell>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({ avatar, displayName, bio })
  }

  return (
    <CommunityShell>
      <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft />
              返回
            </Button>
            <h1 className="text-2xl font-semibold">个人资料设置</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>头像</CardTitle>
                <CardDescription>输入头像 URL，或将来支持本地上传</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="size-16">
                    {avatar && <AvatarImage src={avatar} alt={displayName || user.username} />}
                    <AvatarFallback className="bg-primary/10 text-lg text-primary">
                      {getInitials(displayName || user.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="avatar">头像 URL</Label>
                    <Input
                      id="avatar"
                      placeholder="https://example.com/avatar.png"
                      value={avatar}
                      onChange={(e) => setAvatar(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>基本信息</CardTitle>
                <CardDescription>更新你的昵称和个人简介</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">昵称</Label>
                  <Input
                    id="displayName"
                    placeholder="你的昵称"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">个人简介</Label>
                  <Textarea
                    id="bio"
                    placeholder="介绍一下自己吧…"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground">{bio.length}/200</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAvatar(user.avatar || '')
                  setDisplayName(user.displayName || '')
                  setBio(user.bio || '')
                }}
              >
                重置
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save />
                )}
                保存修改
              </Button>
            </div>
          </form>

          {/* 屏蔽管理 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldOff className="size-4 text-destructive" />
                屏蔽管理
              </CardTitle>
              <CardDescription>拉黑后不再看到对方的帖子与评论</CardDescription>
            </CardHeader>
            <CardContent>
              {blockedQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  加载中…
                </div>
              ) : blockedQuery.data && blockedQuery.data.items.length > 0 ? (
                <div className="divide-y divide-border">
                  {blockedQuery.data.items.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 py-2.5">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(u.username)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Link href={`/u/${encodeURIComponent(u.username)}`} className="font-medium hover:text-primary">
                          {u.displayName || u.username}
                        </Link>
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={unblockMutation.isPending}
                        onClick={() => unblockMutation.mutate(u.username)}
                      >
                        {unblockMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Ban />}
                        解除
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无拉黑用户</p>
              )}
            </CardContent>
          </Card>

          {/* 通知偏好 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                通知偏好
              </CardTitle>
              <CardDescription>控制接收哪些类型的通知，以及免打扰时段</CardDescription>
            </CardHeader>
            <CardContent>
              {prefsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  加载中…
                </div>
              ) : prefsQuery.data ? (
                <div className="space-y-3">
                  {[
                    { key: 'comment', label: '评论通知', desc: '有人评论你的帖子时' },
                    { key: 'reply', label: '回复通知', desc: '有人回复你的评论时' },
                    { key: 'like', label: '点赞通知', desc: '有人给你的内容点赞时' },
                    { key: 'follow', label: '关注通知', desc: '有人关注你时' },
                    { key: 'mention', label: '@提及通知', desc: '有人在内容中提及你时' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={prefsQuery.data[item.key as keyof NotificationPreference] as boolean}
                        onChange={(v) => updatePref({ [item.key]: v } as Partial<NotificationPreference>)}
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div>
                      <p className="text-sm font-medium">免打扰</p>
                      <p className="text-xs text-muted-foreground">在指定时段内不推送通知</p>
                    </div>
                    <Switch checked={prefsQuery.data.doNotDisturb} onChange={(v) => updatePref({ doNotDisturb: v })} />
                  </div>

                  {prefsQuery.data.doNotDisturb && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                      <span className="text-sm text-muted-foreground">时段</span>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={prefsQuery.data.quietStartHour}
                        onChange={(e) => updatePref({ quietStartHour: Number(e.target.value) })}
                        className="h-8 w-20"
                      />
                      <span className="text-sm text-muted-foreground">至</span>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={prefsQuery.data.quietEndHour}
                        onChange={(e) => updatePref({ quietEndHour: Number(e.target.value) })}
                        className="h-8 w-20"
                      />
                      <span className="text-xs text-muted-foreground">时（24 小时制）</span>
                    </div>
                  )}

                  {prefsMutation.isPending && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      保存中…
                    </p>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
      </div>
    </CommunityShell>
  )
}
