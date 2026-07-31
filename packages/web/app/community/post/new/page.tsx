'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'

const schema = z.object({
  title: z.string().min(1, '请输入标题').max(100, '标题最多 100 字'),
  content: z.string().min(1, '请输入内容').max(20000, '内容过长'),
  channel: z.string(),
})
type FormValues = z.infer<typeof schema>

export default function NewPostPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { channel: 'general' },
  })

  // 登录态前置检查：未登录跳 /login（需求 9.1）
  useEffect(() => {
    if (!token) {
      router.replace('/login')
    }
  }, [token, router])

  const selectedChannel = watch('channel')

  const onSubmit = async (values: FormValues) => {
    try {
      const post = await api.post<Post>('/posts', values)
      toast.success('发布成功')
      router.push(`/community/post/${post.id}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '发布失败，请重试')
    }
  }

  // 未登录时不渲染表单，避免用户填完才被拒
  if (!token) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>发布新帖</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input id="title" placeholder="一句话概括你的想法" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>频道</Label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => {
                  const active = selectedChannel === ch
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setValue('channel', ch, { shouldValidate: true })}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      }`}
                    >
                      {CHANNEL_LABELS[ch] || ch}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">内容</Label>
              <Textarea id="content" rows={10} placeholder="分享你的想法（支持纯文本）" {...register('content')} />
              {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                发布
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
