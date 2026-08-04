'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save, Send, Sparkles, FileText, ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, apiFetch, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useChannels } from '@/lib/use-channels'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'
import { MarkdownEditor } from '@/components/markdown-editor'

export default function EditPostPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [font, setFont] = useState('default')
  const [channel, setChannel] = useState('general')
  const [tagsInput, setTagsInput] = useState('')
  const [status, setStatus] = useState<'published' | 'draft'>('published')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [editorHeight, setEditorHeight] = useState(600)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const { data: channels } = useChannels()

  const isDraft = status === 'draft'

  const channelItems = (channels && channels.length > 0)
    ? channels
    : CHANNELS.map((name) => ({ name, label: CHANNEL_LABELS[name] || name }))

  useEffect(() => {
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(`/community/post/${params.id}/edit`)}`)
      return
    }
    api.get<Post>(`/posts/${params.id}`)
      .then((p) => {
        setTitle(p.title)
        setContent(p.content)
        setFont(p.font || 'default')
        setChannel(p.channel)
        setStatus(p.status)
        setTagsInput(p.tags.join(', '))
        setAiSummary(p.aiSummary || '')
        setCoverUrl(p.coverUrl || '')
        setLoading(false)
      })
      .catch(() => {
        toast.error('帖子加载失败')
        router.push(`/community/post/${params.id}`)
      })
  }, [token, params.id, router])

  useEffect(() => {
    const updateHeight = () => setEditorHeight(window.innerHeight - 270)
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  const parseTags = () =>
    tagsInput.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 5)

  // AI 建议标题
  const handleSuggestTitle = async () => {
    if (!content || content.trim().length < 10) {
      toast.error('内容至少 10 个字才能生成标题')
      return
    }
    setSuggestingTitle(true)
    setTitleSuggestions([])
    try {
      const data = await api.post<{ titles: string[] }>('/ai/suggest-title', { content })
      if (data.titles.length === 0) {
        toast.error('未能生成标题，请手动输入')
        return
      }
      setTitleSuggestions(data.titles)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 生成失败，请手动输入')
    } finally {
      setSuggestingTitle(false)
    }
  }

  // AI 生成标签
  const handleSuggestTags = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('请先填写标题和内容')
      return
    }
    try {
      const data = await api.post<{ tags: string[] }>('/posts/suggest-tags', { title: title.trim(), content })
      if (data.tags.length === 0) {
        toast.error('未能生成标签，请手动输入')
        return
      }
      const existing = parseTags()
      const merged = [...new Set([...existing, ...data.tags])].slice(0, 5)
      setTagsInput(merged.join(', '))
      toast.success(`AI 生成了 ${data.tags.length} 个标签`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 生成失败，请手动输入')
    }
  }, [title, content, tagsInput])

  // AI 生成摘要
  const handleSummarize = async () => {
    if (!content || content.trim().length < 10) {
      toast.error('内容至少 10 个字才能生成摘要')
      return
    }
    setSummarizing(true)
    try {
      const data = await api.post<{ summary: string }>('/ai/summarize', { content })
      setAiSummary(data.summary)
      toast.success('摘要已生成')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 摘要生成失败')
    } finally {
      setSummarizing(false)
    }
  }

  // 保存（已发布帖子更新 / 草稿保存）
  const handleSave = async (targetStatus: 'published' | 'draft') => {
    if (!content.trim()) {
      toast.error('内容为空')
      return
    }
    setSubmitting(true)
    try {
      const tags = parseTags()
      await api.put(`/posts/${params.id}`, {
        title: title.trim(),
        content,
        status: targetStatus,
        channel,
        tags: tags.length > 0 ? tags : undefined,
        aiSummary: aiSummary.trim() || undefined,
        font,
        coverUrl: coverUrl || undefined,
      })
      if (targetStatus === 'draft') {
        toast.success('草稿已保存')
      } else if (isDraft) {
        toast.success('发布成功')
        router.push(`/community/post/${params.id}`)
      } else {
        toast.success('已保存')
        router.push(`/community/post/${params.id}`)
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 发布弹窗确认（草稿转发布）
  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error('请填写标题')
      return
    }
    if (!content.trim()) {
      toast.error('内容不能为空')
      return
    }
    setSubmitting(true)
    try {
      const tags = parseTags()
      await api.put(`/posts/${params.id}`, {
        title: title.trim(),
        content,
        status: 'published',
        channel,
        tags: tags.length > 0 ? tags : undefined,
        aiSummary: aiSummary.trim() || undefined,
        font,
        coverUrl: coverUrl || undefined,
      })
      toast.success('发布成功')
      router.push(`/community/post/${params.id}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '发布失败')
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
    <div className="mx-auto flex h-[calc(100vh-56px)] max-w-6xl flex-col px-4 pt-3">
      {/* 顶栏：返回 + 标题 */}
      <div className="mb-3 flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => router.back()}
          title="返回"
          aria-label="返回"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold">{isDraft ? '编辑草稿' : '编辑帖子'}</h1>
        {isDraft && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">草稿</span>
        )}
      </div>
      {/* 标题 + 标签 */}
      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className="flex-1 text-base font-semibold"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1.5 text-xs text-primary"
            disabled={suggestingTitle}
            onClick={handleSuggestTitle}
            title="根据内容 AI 生成标题"
          >
            {suggestingTitle ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            AI 标题
          </Button>
        </div>
        {titleSuggestions.length > 0 && (
          <div className="space-y-1 rounded-lg border bg-accent/50 p-2">
            {titleSuggestions.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setTitle(t)
                  setTitleSuggestions([])
                }}
                className="block w-full truncate rounded-md px-2 py-1 text-left text-sm text-accent-foreground transition-colors hover:bg-accent"
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="标签（逗号分隔，最多5个）"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1.5 text-xs text-primary"
            onClick={handleSuggestTags}
            title="根据标题和内容 AI 生成标签"
          >
            <Sparkles className="size-3.5" />
            AI 标签
          </Button>
        </div>
      </div>
      {/* 封面图 */}
      <div className="space-y-2">
        {coverUrl ? (
          <div className="relative group">
            <img src={coverUrl} alt="封面预览" className="w-full max-h-48 object-cover rounded-lg" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 size-7 opacity-90"
              onClick={() => setCoverUrl('')}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={coverUploading}
            onClick={() => coverInputRef.current?.click()}
          >
            {coverUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {coverUploading ? '上传中…' : '添加封面图'}
          </Button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (file.size > 5 * 1024 * 1024) {
              toast.error('图片文件太大，最多 5MB')
              e.target.value = ''
              return
            }
            setCoverUploading(true)
            try {
              const formData = new FormData()
              formData.append('file', file)
              const data = await apiFetch<{ url: string }>('/upload/image', { method: 'POST', body: formData })
              setCoverUrl(data.url)
              toast.success('封面上传成功')
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : '上传失败')
            } finally {
              setCoverUploading(false)
              e.target.value = ''
            }
          }}
        />
      </div>
      {/* 编辑器占满剩余空间 */}
      <MarkdownEditor
        value={content}
        onChange={setContent}
        height={editorHeight}
        font={font}
        onFontChange={setFont}
        placeholder="支持 Markdown 语法，输入 @ 可提及用户…"
        toolbarEnd={
          isDraft ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={submitting || !content.trim()}
                onClick={() => handleSave('draft')}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                保存草稿
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-primary"
                disabled={!content.trim()}
                onClick={() => setDialogOpen(true)}
              >
                <Send className="size-3.5" />
                发布
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-primary"
              disabled={submitting || !content.trim()}
              onClick={() => handleSave('published')}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              保存
            </Button>
          )
        }
      />

      {/* 发布弹窗（草稿转发布）：确认标题/频道/标签 */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submitting && setDialogOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">发布帖子</h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pub-title">标题</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={suggestingTitle}
                  onClick={handleSuggestTitle}
                >
                  {suggestingTitle ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {suggestingTitle ? '生成中…' : 'AI 建议标题'}
                </Button>
              </div>
              <Input
                id="pub-title"
                placeholder="一句话概括你的想法"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              {titleSuggestions.length > 0 && (
                <div className="space-y-1 rounded-lg border bg-accent/50 p-2">
                  {titleSuggestions.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setTitle(t)
                        setTitleSuggestions([])
                      }}
                      className="block w-full truncate rounded-md px-2 py-1 text-left text-sm text-accent-foreground transition-colors hover:bg-accent"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>频道</Label>
              <div className="flex flex-wrap gap-2">
                {channelItems.map((ch) => {
                  const active = channel === ch.name
                  return (
                    <button
                      key={ch.name}
                      type="button"
                      onClick={() => setChannel(ch.name)}
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
              <div className="flex items-center justify-between">
                <Label htmlFor="pub-tags">标签</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleSuggestTags}
                >
                  <Sparkles className="size-3" />
                  AI 生成标签
                </Button>
              </div>
              <Input
                id="pub-tags"
                placeholder="用逗号或空格分隔，最多 5 个标签"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pub-summary">AI 摘要（可选）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={summarizing}
                  onClick={handleSummarize}
                >
                  {summarizing ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {summarizing ? '生成中…' : '生成摘要'}
                </Button>
              </div>
              <textarea
                id="pub-summary"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                placeholder="点击「生成摘要」自动生成，或手动输入。用于列表卡片展示。"
                value={aiSummary}
                onChange={(e) => setAiSummary(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={handlePublish} disabled={submitting || !title.trim()}>
                {submitting && <Loader2 className="animate-spin" />}
                确认发布
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
