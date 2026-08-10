'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { JSONContent } from '@tiptap/core'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save, Send, FileText, AlertTriangle, RefreshCw, ArrowRightLeft, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, apiFetch, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useChannels } from '@/lib/use-channels'
import { useAiEnrich } from '@/lib/use-ai-enrich'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/rich-text-editor'
import { MarkdownEditor, type MarkdownEditorHandle, MAX_POST_CHARS, MAX_POST_IMAGES, compressImage } from '@/components/markdown-editor'
import { countContentImages, emptyContentDoc, normalizeContentDoc, markdownToTiptapDoc, tiptapDocToMarkdown } from '@/lib/content-projection'
import { PostSettingsSheet } from '@/app/community/components/post-settings-sheet'
import { SaveStatusIndicator } from '@/components/save-status-indicator'
import { useDraftAutoSave, markDraftSynced } from '@/lib/use-draft-autosave'
import { deleteDraftFromDB } from '@/lib/draft-storage'
import type { DraftData } from '@/lib/draft-storage'
import {
  getDefaultEditor,
  isRichTextEditorEnabled,
  isEditorDowngradeAllowed,
  isContentDocSyncEnabled,
  type EditorType,
} from '@/lib/feature-flags'
import {
  EditorEvents,
  trackEditor,
  captureError,
} from '@/lib/analytics'

const PAGE_TYPE = 'edit-post'

export default function EditPostPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [content, setContent] = useState('')
  const [contentDoc, setContentDoc] = useState<JSONContent>(emptyContentDoc)
  const [title, setTitle] = useState('')
  const [font, setFont] = useState('default')
  const [channel, setChannel] = useState('general')
  const [tagsInput, setTagsInput] = useState('')
  const [status, setStatus] = useState<'published' | 'draft'>('published')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [editorHeight, setEditorHeight] = useState(600)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [serverPost, setServerPost] = useState<(Post & { updatedAt: string }) | null>(null)
  const richEditorRef = useRef<RichTextEditorHandle>(null)
  const markdownEditorRef = useRef<MarkdownEditorHandle>(null)
  const { data: channels } = useChannels()

  const [editorType, setEditorType] = useState<EditorType>('rich-text')
  const [editorInitialized, setEditorInitialized] = useState(false)

  const userId = user?.id ?? ''
  const isDraft = status === 'draft'

  const parseTags = useCallback(
    () => tagsInput.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 5),
    [tagsInput],
  )

  const currentDraftData = useMemo<DraftData>(
    () => ({
      title,
      content,
      contentDoc,
      channel,
      tags: parseTags(),
      aiSummary,
      font,
      coverUrl,
      status,
    }),
    [title, content, contentDoc, channel, aiSummary, font, coverUrl, status, parseTags],
  )

  const initialServerForAutosave = serverPost
    ? {
        title: serverPost.title,
        content: serverPost.content,
        contentDoc: normalizeContentDoc(serverPost.contentDoc, serverPost.content),
        channel: serverPost.channel,
        tags: serverPost.tags,
        aiSummary: serverPost.aiSummary || '',
        font: serverPost.font || 'default',
        coverUrl: serverPost.coverUrl || '',
        status: serverPost.status,
        updatedAt: serverPost.updatedAt,
      }
    : undefined

  const {
    draft,
    saveStatus,
    lastSavedAt,
    lastError,
    conflict,
    setDraftData,
    flushSave,
    discardLocal,
    useLocalVersion: applyLocalVersion,
    acceptServerVersion,
    pause,
    resume,
    clearDraftAfterPublish,
  } = useDraftAutoSave({
    userId,
    postId: params.id,
    initialServerDraft: initialServerForAutosave,
    onDraftRestored: (restored) => {
      setTitle(restored.title)
      setContent(restored.content)
      setContentDoc(restored.contentDoc)
      setChannel(restored.channel)
      setTagsInput(restored.tags.join(', '))
      setAiSummary(restored.aiSummary)
      setFont(restored.font || 'default')
      setCoverUrl(restored.coverUrl)
      setStatus(restored.status)
    },
    onConflictDetected: () => setConflictDialogOpen(true),
  })

  useEffect(() => {
    if (hasHydrated && !token) {
      router.replace(`/login?redirect=${encodeURIComponent(`/community/post/${params.id}/edit`)}`)
      return
    }
    if (!token) return
    api.get<Post>(`/posts/${params.id}`)
      .then((p) => {
        setServerPost(p as Post & { updatedAt: string })
        setTitle(p.title)
        setContent(p.content)
        const doc = normalizeContentDoc(p.contentDoc, p.content)
        setContentDoc(doc)
        setFont(p.font || 'default')
        setChannel(p.channel)
        setStatus(p.status)
        setTagsInput(p.tags.join(', '))
        setAiSummary(p.aiSummary || '')
        setCoverUrl(p.coverUrl || '')
        setLoading(false)

        if (!editorInitialized) {
          const richEnabled = isRichTextEditorEnabled()
          const def = getDefaultEditor()
          const hasContentDoc = p.contentDoc && typeof p.contentDoc === 'object'
          const serverForcesMarkdown = p.editorDowngraded || p.contentDocEnabled === false
          const inferredFormat: 'markdown' | 'richtext' = hasContentDoc ? 'richtext' : 'markdown'
          const serverPrefersRich = !serverForcesMarkdown && (inferredFormat === 'richtext' || hasContentDoc)
          // 编辑帖：优先尊重服务端存储（editorDowngraded / contentDocEnabled / inferredFormat / hasContentDoc），
          // 其次才用 FeatureFlags 默认；降级时仍允许按钮切回富文本（由 featureFlags.editorDowngradeAllowed 控制）。
          let initial: EditorType
          if (serverForcesMarkdown) {
            initial = 'markdown'
          } else if (serverPrefersRich) {
            initial = richEnabled ? 'rich-text' : 'markdown'
          } else {
            initial = richEnabled && def === 'rich-text' ? 'rich-text' : 'markdown'
          }
          setEditorType(initial)
          setEditorInitialized(true)
          trackEditor(EditorEvents.EditorLoad, {
            editorType: initial,
            pageType: PAGE_TYPE,
            postId: params.id,
            richTextEnabled: richEnabled,
            downgradeAllowed: isEditorDowngradeAllowed(),
            hasContentDoc,
            contentDocEnabled: p.contentDocEnabled,
            editorDowngraded: p.editorDowngraded,
            contentFormat: inferredFormat,
            serverForcesMarkdown,
            serverPrefersRich,
          })
        }
      })
      .catch((e) => {
        captureError(e, { component: 'EditPostPage.loadPost', pageType: PAGE_TYPE, extra: { postId: params.id } })
        toast.error('帖子加载失败')
        router.push(`/community/post/${params.id}`)
      })
  }, [token, params.id, router, hasHydrated, editorInitialized])

  useEffect(() => {
    const updateHeight = () => setEditorHeight(window.innerHeight - (window.innerWidth < 768 ? 200 : 270))
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    if (!draft || loading) return
    setDraftData(currentDraftData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, contentDoc, channel, tagsInput, aiSummary, font, coverUrl, status])

  const channelItems = (channels && channels.length > 0)
    ? channels
    : CHANNELS.map((name) => ({ name, label: CHANNEL_LABELS[name] || name }))

  const resolveCover = async (): Promise<string | undefined> => {
    if (!coverFile) return coverUrl || undefined
    let uploadFile: File = coverFile
    if (coverFile.size > 1024 * 1024) {
      uploadFile = await compressImage(coverFile, 1920, 0.85)
    }
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      const data = await apiFetch<{ url: string }>('/upload/image', { method: 'POST', body: formData })
      return data.url
    } catch (err) {
      captureError(err, { component: 'EditPostPage.resolveCover', editorType, pageType: PAGE_TYPE })
      toast.error(err instanceof ApiError ? err.message : '封面图上传失败')
      throw err
    }
  }

  const mergeTags = useCallback((incoming: string[]) => {
    setTagsInput((prev) => {
      const existing = prev.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)
      return [...new Set([...existing, ...incoming])].slice(0, 5).join(', ')
    })
  }, [])

  const { enriching, regenerating, run: runEnrich } = useAiEnrich({
    onTitles: setTitleSuggestions,
    onSummary: setAiSummary,
    onTags: mergeTags,
  })

  const handleEnrich = () => runEnrich(title, content)
  const handleRegenTitle = () => runEnrich(title, content, 'title')
  const handleRegenSummary = () => runEnrich(title, content, 'summary')
  const handleRegenTags = () => runEnrich(title, content, 'tags')

  const validatePostLimits = () => {
    const charCount = [...content].length
    const imageCount = editorType === 'rich-text' ? countContentImages(contentDoc) : 0
    if (charCount > MAX_POST_CHARS) {
      toast.error(`正文超过 ${MAX_POST_CHARS.toLocaleString()} 字，无法保存或发布`)
      return false
    }
    if (imageCount > MAX_POST_IMAGES) {
      toast.error(`图片超过 ${MAX_POST_IMAGES} 张，无法保存或发布`)
      return false
    }
    return true
  }

  const resolveEditorImages = async (): Promise<{ doc?: JSONContent; markdown: string }> => {
    if (editorType === 'rich-text') {
      return richEditorRef.current?.resolveImages() ?? { doc: contentDoc, markdown: content }
    } else {
      const markdown = await markdownEditorRef.current?.resolveImages() ?? content
      return { markdown }
    }
  }

  const handleSave = async (targetStatus: 'published' | 'draft') => {
    if (!content.trim()) {
      toast.error('内容为空')
      return
    }
    if (!validatePostLimits()) return
    trackEditor(EditorEvents.SaveDraftStart, { editorType, pageType: PAGE_TYPE, postId: params.id, targetStatus })
    setSubmitting(true)
    try {
      await flushSave()
      const tags = parseTags()
      const resolved = await resolveEditorImages()
      const cover = await resolveCover()
      const syncContentDoc = isContentDocSyncEnabled()
      const resp = await api.put<Post>(`/posts/${params.id}`, {
        title: title.trim(),
        content: resolved?.markdown || content,
        contentDoc: syncContentDoc ? (resolved?.doc || contentDoc) : undefined,
        status: targetStatus,
        channel,
        tags: tags.length > 0 ? tags : undefined,
        aiSummary: aiSummary.trim() || undefined,
        font,
        coverUrl: cover,
        contentDocEnabled: syncContentDoc,
        editorDowngraded: editorType === 'markdown' && isRichTextEditorEnabled(),
        expectedUpdatedAt: serverPost?.updatedAt,
      })
      if (draft) {
        const synced = markDraftSynced(draft, new Date(resp.updatedAt))
        await deleteDraftFromDB(synced.id)
      }
      trackEditor(EditorEvents.SaveDraftSuccess, { editorType, pageType: PAGE_TYPE, postId: params.id, targetStatus })
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
      captureError(e, { component: 'EditPostPage.handleSave', editorType, pageType: PAGE_TYPE, extra: { postId: params.id, targetStatus } })
      trackEditor(EditorEvents.SaveDraftError, { editorType, pageType: PAGE_TYPE, postId: params.id, error: e instanceof Error ? e.message : String(e) })
      if (e instanceof ApiError && e.status === 409) {
        toast.error('帖子已被其他会话修改，请刷新后重试')
        setConflictDialogOpen(true)
      } else {
        toast.error(e instanceof ApiError ? e.message : '保存失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error('请填写标题')
      return
    }
    if (!content.trim()) {
      toast.error('内容不能为空')
      return
    }
    if (!validatePostLimits()) return
    trackEditor(EditorEvents.PublishStart, { editorType, pageType: PAGE_TYPE, postId: params.id })
    setSubmitting(true)
    pause()
    try {
      await flushSave()
      const tags = parseTags()
      const resolved = await resolveEditorImages()
      const cover = await resolveCover()
      const syncContentDoc = isContentDocSyncEnabled()
      const resp = await api.put<Post>(`/posts/${params.id}`, {
        title: title.trim(),
        content: resolved?.markdown || content,
        contentDoc: syncContentDoc ? (resolved?.doc || contentDoc) : undefined,
        status: 'published',
        channel,
        tags: tags.length > 0 ? tags : undefined,
        aiSummary: aiSummary.trim() || undefined,
        font,
        coverUrl: cover,
        contentDocEnabled: syncContentDoc,
        editorDowngraded: editorType === 'markdown' && isRichTextEditorEnabled(),
        expectedUpdatedAt: serverPost?.updatedAt,
      })
      await clearDraftAfterPublish()
      trackEditor(EditorEvents.PublishSuccess, { editorType, pageType: PAGE_TYPE, postId: params.id })
      toast.success('发布成功')
      router.push(`/community/post/${params.id}`)
    } catch (e) {
      captureError(e, { component: 'EditPostPage.handlePublish', editorType, pageType: PAGE_TYPE, extra: { postId: params.id } })
      trackEditor(EditorEvents.PublishError, { editorType, pageType: PAGE_TYPE, postId: params.id, error: e instanceof Error ? e.message : String(e) })
      if (e instanceof ApiError && e.status === 409) {
        toast.error('帖子已被其他会话修改，请刷新后重试')
        setConflictDialogOpen(true)
      } else {
        toast.error(e instanceof ApiError ? e.message : '发布失败')
      }
      resume()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSwitchEditor = async (target: EditorType) => {
    if (target === editorType) return
    trackEditor(EditorEvents.EditorSwitch, {
      editorType,
      pageType: PAGE_TYPE,
      targetEditor: target,
      postId: params.id,
    })
    try {
      if (target === 'markdown') {
        trackEditor(EditorEvents.EditorDowngrade, { editorType: 'rich-text', pageType: PAGE_TYPE, postId: params.id })
        const currentMarkdown = content || tiptapDocToMarkdown(contentDoc)
        setContent(currentMarkdown)
      } else {
        trackEditor(EditorEvents.EditorUpgrade, { editorType: 'markdown', pageType: PAGE_TYPE, postId: params.id })
        const doc = markdownToTiptapDoc(content)
        setContentDoc(doc)
      }
      setEditorType(target)
    } catch (e) {
      captureError(e, {
        component: 'EditPostPage.handleSwitchEditor',
        editorType,
        pageType: PAGE_TYPE,
        extra: { target, postId: params.id },
      })
      trackEditor(EditorEvents.EditorSwitchFallback, {
        editorType,
        pageType: PAGE_TYPE,
        postId: params.id,
        targetEditor: target,
        error: e instanceof Error ? e.message : String(e),
        fallbackEditor: editorType,
      })
      toast.error('编辑器切换失败，已保留当前模式')
    }
  }

  if (!hasHydrated || !token || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-6xl flex-col px-4 pt-3">
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
        <div className="ml-auto flex items-center gap-2">
          {isEditorDowngradeAllowed() && isRichTextEditorEnabled() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleSwitchEditor(editorType === 'rich-text' ? 'markdown' : 'rich-text')}
              title={editorType === 'rich-text' ? '切换到 Markdown 编辑器' : '切换到富文本编辑器'}
            >
              <ArrowRightLeft className="size-3.5" />
              {editorType === 'rich-text' ? 'Markdown 模式' : '富文本模式'}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setSettingsOpen(true)}
            title="文章设置"
            aria-label="文章设置"
          >
            <Settings className="size-4" />
          </Button>
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={lastError}
          />
        </div>
      </div>
      {editorType === 'rich-text' ? (
        <RichTextEditor
          ref={richEditorRef}
          value={contentDoc}
          onChange={(doc, markdown) => {
            setContentDoc(doc)
            setContent(markdown)
          }}
          height={editorHeight}
          font={font}
          onFontChange={(key) => {
            setFont(key)
            trackEditor(EditorEvents.FontChange, { editorType, pageType: PAGE_TYPE, font: key, postId: params.id })
          }}
          placeholder="继续写作…"
          pageType="edit-post"
          postId={params.id}
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
      ) : (
        <MarkdownEditor
          ref={markdownEditorRef}
          value={content}
          onChange={setContent}
          height={editorHeight}
          font={font}
          onFontChange={(key) => {
            setFont(key)
            trackEditor(EditorEvents.FontChange, { editorType, pageType: PAGE_TYPE, font: key, postId: params.id })
          }}
          placeholder="继续写作…（支持 Markdown）"
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
      )}

      <PostSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        mode="settings"
        titleRequired={false}
        confirmLabel={isDraft ? '保存草稿' : '保存设置'}
        title={title}
        onTitleChange={setTitle}
        titleSuggestions={titleSuggestions}
        onTitleSuggestionSelect={(t) => {
          setTitle(t)
          setTitleSuggestions([])
        }}
        channel={channel}
        onChannelChange={setChannel}
        channelItems={channelItems}
        coverUrl={coverUrl}
        onCoverChange={(url, file) => {
          setCoverUrl(url)
          setCoverFile(file)
        }}
        tagsInput={tagsInput}
        onTagsInputChange={setTagsInput}
        aiSummary={aiSummary}
        onAiSummaryChange={setAiSummary}
        enriching={enriching}
        regenerating={regenerating}
        onEnrichAll={handleEnrich}
        onRegenTitle={handleRegenTitle}
        onRegenTags={handleRegenTags}
        onRegenSummary={handleRegenSummary}
        submitting={submitting}
        onConfirm={() => handleSave(isDraft ? 'draft' : 'published')}
      />

      <PostSettingsSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="publish"
        titleRequired
        confirmLabel="确认发布"
        title={title}
        onTitleChange={setTitle}
        titleSuggestions={titleSuggestions}
        onTitleSuggestionSelect={(t) => {
          setTitle(t)
          setTitleSuggestions([])
        }}
        channel={channel}
        onChannelChange={setChannel}
        channelItems={channelItems}
        coverUrl={coverUrl}
        onCoverChange={(url, file) => {
          setCoverUrl(url)
          setCoverFile(file)
        }}
        tagsInput={tagsInput}
        onTagsInputChange={setTagsInput}
        aiSummary={aiSummary}
        onAiSummaryChange={setAiSummary}
        enriching={enriching}
        regenerating={regenerating}
        onEnrichAll={handleEnrich}
        onRegenTitle={handleRegenTitle}
        onRegenTags={handleRegenTags}
        onRegenSummary={handleRegenSummary}
        submitting={submitting}
        onConfirm={handlePublish}
      />

      {conflictDialogOpen && conflict && serverPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConflictDialogOpen(false)}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 shrink-0 text-amber-500" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold">检测到草稿冲突</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  服务器版本（{new Date(serverPost.updatedAt).toLocaleString()}）与本地草稿均有更新。请选择如何处理。
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-end gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await discardLocal()
                  setConflictDialogOpen(false)
                }}
              >
                放弃本地，使用服务器版本
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await acceptServerVersion({
                    title: serverPost.title,
                    content: serverPost.content,
                    contentDoc: normalizeContentDoc(serverPost.contentDoc, serverPost.content),
                    channel: serverPost.channel,
                    tags: serverPost.tags,
                    aiSummary: serverPost.aiSummary || '',
                    font: serverPost.font || 'default',
                    coverUrl: serverPost.coverUrl || '',
                    status: serverPost.status,
                    updatedAt: serverPost.updatedAt,
                  })
                  setConflictDialogOpen(false)
                }}
              >
                <RefreshCw className="size-3.5" />
                重载服务器版本
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  await applyLocalVersion()
                  setConflictDialogOpen(false)
                  toast.info('已保留本地版本，保存时会覆盖服务器')
                }}
              >
                保留本地草稿
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
