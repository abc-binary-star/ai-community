'use client'

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
import { api, ApiError } from '@/lib/api'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'

const schema = z.object({
  title: z.string().min(1, '请输入标题').max(100, '标题最多 100 字'),
  content: z.string().min(1, '请输入内容').max(20000, '内容过长'),
  channel: z.string(),
})
type FormValues = z.infer<typeof schema>

export default function NewPostPage() {
  const router = useRouter()
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 border-b border-border pb-4">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-muted-foreground">§ 投稿</p>
        <h1 className="mt-1 font-display text-4xl leading-none">写下你的想法。</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-2">
          <Label className="font-sans text-xs uppercase tracking-wider text-muted-foreground">标题</Label>
          <Input
            placeholder="一句话概括你的想法"
            className="h-12 font-display text-xl"
            {...register('title')}
          />
          {errors.title && <p className="font-serif text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-2">
          <Label className="font-sans text-xs uppercase tracking-wider text-muted-foreground">频道</Label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((ch) => {
              const active = selectedChannel === ch
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setValue('channel', ch, { shouldValidate: true })}
                  className={`border px-3 py-1.5 font-sans text-sm transition-colors ${
                    active
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {CHANNEL_LABELS[ch] || ch}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-sans text-xs uppercase tracking-wider text-muted-foreground">内容</Label>
          <Textarea
            rows={14}
            placeholder="分享你的想法（支持纯文本）…"
            className="min-h-[280px]"
            {...register('content')}
          />
          {errors.content && <p className="font-serif text-xs text-destructive">{errors.content.message}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border pt-6">
          <Button type="button" variant="link" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            发布
          </Button>
        </div>
      </form>
    </div>
  )
}
