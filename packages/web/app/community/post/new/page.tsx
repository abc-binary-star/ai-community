'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useChannels } from '@/lib/use-channels'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'
import { MarkdownEditor } from '@/components/markdown-editor'

const schema = z.object({
  title: z.string().min(1, '请输入标题').max(100, '标题最多 100 字'),
  content: z.string().min(1, '请输入内容').max(20000, '内容过长'),
  channel: z.string(),
  tags: z.array(z.string().trim().min(1).max(20)).max(5).optional(),
})
type FormValues = z.infer<typeof schema>

export default function NewPostPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const [tagsInput, setTagsInput] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const { data: channels } = useChannels()

  // 频道列表，API 加载前使用 fallback
  const channelItems = (channels && channels.length > 0)
    ? channels
    : CHANNELS.map((name) => ({ name, label: CHANNEL_LABELS[name] || name }))
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { channel: 'general' },
  })

  useEffect(() => {
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent('/community/post/new')}`)
    }
  }, [token, router])

  const selectedChannel = watch('channel')

  // AI 生成标签
  const handleSuggestTags = async () => {
    const title = getValues('title')
    const content = getValues('content')
    if (!title || !content) {
      toast.error('请先填写标题和内容')
      return
    }
    setSuggesting(true)
    try {
      const data = await api.post<{ tags: string[] }>('/posts/suggest-tags', { title, content })
      if (data.tags.length === 0) {
        toast.error('未能生成标签，请手动输入')
        return
      }
      // 合并已有标签和 AI 标签，去重，最多 5 个
      const existing = tagsInput.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)
      const merged = [...new Set([...existing, ...data.tags])].slice(0, 5)
      setTagsInput(merged.join(', '))
      toast.success(`AI 生成了 ${data.tags.length} 个标签`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 生成失败，请手动输入')
    } finally {
      setSuggesting(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5)
    try {
      const post = await api.post<Post>('/posts', { ...values, tags: tags.length > 0 ? tags : undefined })
      toast.success('发布成功')
      router.push(`/community/post/${post.id}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '发布失败，请重试')
    }
  }

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
                {channelItems.map((ch) => {
                  const active = selectedChannel === ch.name
                  return (
                    <button
                      key={ch.name}
                      type="button"
                      onClick={() => setValue('channel', ch.name, { shouldValidate: true })}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      }`}
                    >
                      {ch.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">内容</Label>
              <MarkdownEditor
                value={watch('content') || ''}
                onChange={(val) => setValue('content', val, { shouldValidate: true })}
                placeholder="支持 Markdown 语法，输入 @ 可提及用户"
              />
              {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tags">标签</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={suggesting}
                  onClick={handleSuggestTags}
                >
                  {suggesting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {suggesting ? '生成中…' : 'AI 生成标签'}
                </Button>
              </div>
              <Input
                id="tags"
                placeholder="用逗号或空格分隔，最多 5 个标签"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">用逗号或空格分隔，不需要加 # 号，例如：AI, 前端 开源</p>
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
