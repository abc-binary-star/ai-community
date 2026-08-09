'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Bell, Check, Image as ImageIcon, Loader2, Save, ShieldOff, Sparkles, Upload, User, X } from 'lucide-react'
import Cropper from 'react-easy-crop'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, apiFetch, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { CommunityShell } from '@/app/community/components/community-shell'
import { cn, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { NotificationPreference, Paginated, PublicUser, User as UserType } from 'shared'

type FeatureUsage = {
  feature: string
  usedToday: number
  limitPerDay: number
  limitPerMinute: number
}

type AIUsage = {
  plan: 'free' | 'pro' | 'admin'
  planExpiresAt: string | null
  unlimited: boolean
  dailyTokenLimit: number
  tokensUsedToday: number
  poolTokenLimit: number
  poolTokensUsed: number
  features: FeatureUsage[]
}

const featureLabels: Record<string, string> = {
  enrich: 'AI 补全',
  suggest_title: '标题建议',
  summarize: '摘要生成',
  suggest_tags: '标签建议',
  rewrite: '润色',
  voice_polish: '语音润色',
  transcribe: '语音转文字',
  thread_summary: '讨论摘要',
}

// 裁剪图片为 Blob：使用 Canvas 从原图截取选定区域，输出 256x256 PNG
async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve) => { image.onload = resolve })
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, 512, 512,
  )
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png')
  })
}

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
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  const [avatar, setAvatar] = useState(user?.avatar || '')
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

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

  // AI 用量与套餐
  const aiUsageQuery = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.get<AIUsage>('/ai/usage'),
    enabled: !!token,
  })

  const onCropComplete = useCallback((_area: unknown, areaPixels: { x: number; y: number; width: number; height: number }) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  if (!hasHydrated) {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 原图允许超大：裁剪输出固定 256×256 PNG，体积很小，无需限制原始文件大小
    const reader = new FileReader()
    reader.onload = () => {
      setCropImage(reader.result as string)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCropConfirm = async () => {
    if (!cropImage || !croppedAreaPixels) return
    setAvatarUploading(true)
    try {
      const blob = await cropImageToBlob(cropImage, croppedAreaPixels)
      const formData = new FormData()
      formData.append('file', blob, 'avatar.png')
      const data = await apiFetch<{ url: string }>('/upload/avatar', {
        method: 'POST',
        body: formData,
      })
      setAvatar(data.url)
      // 同步全局用户状态，导航栏/消息页等订阅处立即显示新头像
      if (user) setUser({ ...user, avatar: data.url })
      // 全量失效缓存：帖子/评论等作者头像来自接口数据，重新拉取即可用新头像，无需手动刷新页面
      queryClient.invalidateQueries()
      toast.success('头像上传成功')
      setCropImage(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '上传失败')
    } finally {
      setAvatarUploading(false)
    }
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
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-muted-foreground" />
                  头像
                </CardTitle>
                <CardDescription>上传本地图片作为头像，支持 JPG/PNG/WebP/GIF，最大 5MB</CardDescription>
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
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={avatarUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {avatarUploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      {avatarUploading ? '上传中…' : '上传头像'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      或在下方输入 URL
                    </p>
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
                <CardTitle className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  基本信息
                </CardTitle>
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
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                      <span className="text-sm text-muted-foreground">时段</span>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={prefsQuery.data.quietStartHour}
                        onChange={(e) => updatePref({ quietStartHour: Number(e.target.value) })}
                        className="h-8 w-16 sm:w-20"
                      />
                      <span className="text-sm text-muted-foreground">至</span>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={prefsQuery.data.quietEndHour}
                        onChange={(e) => updatePref({ quietEndHour: Number(e.target.value) })}
                        className="h-8 w-16 sm:w-20"
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

          {/* AI 用量与套餐 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                AI 用量与套餐
              </CardTitle>
              <CardDescription>查看当前套餐与今日 AI 额度使用情况</CardDescription>
            </CardHeader>
            <CardContent>
              {aiUsageQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  加载中…
                </div>
              ) : aiUsageQuery.data ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        当前套餐：
                        <span className="text-primary">
                          {aiUsageQuery.data.plan === 'pro'
                            ? '订阅版（Pro）'
                            : aiUsageQuery.data.plan === 'admin'
                              ? '管理员（不限量）'
                              : '免费版'}
                        </span>
                      </p>
                      {aiUsageQuery.data.plan === 'pro' && aiUsageQuery.data.planExpiresAt && (
                        <p className="text-xs text-muted-foreground">
                          有效期至 {new Date(aiUsageQuery.data.planExpiresAt).toLocaleDateString('zh-CN')}
                        </p>
                      )}
                    </div>
                    {aiUsageQuery.data.plan === 'free' && (
                      <Button variant="outline" size="sm" disabled title="订阅支付功能接入中">
                        升级订阅（即将上线）
                      </Button>
                    )}
                  </div>

                  {!aiUsageQuery.data.unlimited && aiUsageQuery.data.dailyTokenLimit > 0 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>今日 token 用量</span>
                        <span>
                          {aiUsageQuery.data.tokensUsedToday.toLocaleString()} /{' '}
                          {aiUsageQuery.data.dailyTokenLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (aiUsageQuery.data.tokensUsedToday / aiUsageQuery.data.dailyTokenLimit) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {!aiUsageQuery.data.unlimited && aiUsageQuery.data.features.length > 0 && (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {aiUsageQuery.data.features.map((f) => (
                        <div key={f.feature} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="text-muted-foreground">{featureLabels[f.feature] || f.feature}</span>
                          <span className="tabular-nums">
                            {f.usedToday}/{f.limitPerDay} 次
                            <span className="ml-2 text-xs text-muted-foreground">限 {f.limitPerMinute} 次/分</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiUsageQuery.data.unlimited && (
                    <p className="text-sm text-muted-foreground">管理员账号不设 AI 用量限制。</p>
                  )}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无法获取 AI 用量</p>
              )}
            </CardContent>
          </Card>
      </div>

      {/* 头像裁剪弹窗 */}
      {cropImage && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
          <div className="mb-4 w-full max-w-sm">
            <div className="relative h-80 w-full rounded-lg overflow-hidden bg-black">
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCropImage(null)}
              disabled={avatarUploading}
            >
              <X className="size-4" />
              取消
            </Button>
            <Button onClick={handleCropConfirm} disabled={avatarUploading}>
              {avatarUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {avatarUploading ? '上传中…' : '确认上传'}
            </Button>
          </div>
        </div>
      )}
    </CommunityShell>
  )
}
