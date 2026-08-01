'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'
import { MentionTextarea } from '@/app/community/components/mention-textarea'

export default function EditPostPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState('general')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(`/community/post/${params.id}/edit`)}`)
      return
    }
    api.get<Post>(`/posts/${params.id}`)
      .then((p) => {
        setTitle(p.title)
        setContent(p.content)
        setChannel(p.channel)
        setLoading(false)
      })
      .catch(() => {
        toast.error('帖子加载失败')
        router.push(`/community/post/${params.id}`)
      })
  }, [token, params.id, router])

  const onSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('标题和内容不能为空')
      return
    }
    setSubmitting(true)
    try {
      await api.put(`/posts/${params.id}`, { title: title.trim(), content: content.trim() })
      toast.success('已更新')
      router.push(`/community/post/${params.id}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token || loading) {
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
          <CardTitle>编辑帖子</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="一句话概括你的想法"
              />
            </div>
            <div className="space-y-2">
              <Label>频道</Label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => {
                  const active = channel === ch
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
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
              <MentionTextarea
                id="content"
                rows={10}
                value={content}
                onChange={setContent}
                placeholder="分享你的想法，输入 @ 可以提及用户"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                取消
              </Button>
              <Button onClick={onSubmit} disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                保存
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
