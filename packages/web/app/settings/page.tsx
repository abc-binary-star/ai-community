'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Loader2, Save, ShieldOff, User } from 'lucide-react'
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
import { Navbar } from '@/app/community/components/navbar'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { Paginated, PublicUser, User as UserType } from 'shared'

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

  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <div className="container flex-1 py-8">
          <div className="mx-auto max-w-md py-20 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  if (!token || !user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <div className="container flex-1 py-8">
          <div className="mx-auto max-w-md py-20 text-center">
            <p className="text-muted-foreground">请先登录</p>
            <Button asChild className="mt-4">
              <Link href="/login">去登录</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({ avatar, displayName, bio })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <div className="container flex-1 py-8">
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
        </div>
      </div>
    </div>
  )
}
