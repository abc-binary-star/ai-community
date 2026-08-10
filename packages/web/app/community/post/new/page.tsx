'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { JSONContent } from '@tiptap/core'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Send, FileText, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, apiFetch, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useChannels } from '@/lib/use-channels'
import { useAiEnrich } from '@/lib/use-ai-enrich'
import { CHANNELS, CHANNEL_LABELS, type Post } from 'shared'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/rich-text-editor'
import { MarkdownEditor, type MarkdownEditorHandle, MAX_POST_CHARS, MAX_POST_IMAGES, compressImage } from '@/components/markdown-editor'
import { countContentImages, emptyContentDoc, markdownToTiptapDoc, tiptapDocToMarkdown } from '@/lib/content-projection'
import { PostSettingsSheet } from '@/app/community/components/post-settings-sheet'
import { SaveStatusIndicator } from '@/components/save-status-indicator'
import { useAutosave, formatSaveTime, type DraftData } from '@/lib/use-autosave'
import {
  getDefaultEditor,
  isRichTextEditorEnabled,
  isEditorDowngradeAllowed,
  isContentDocSyncEnabled,
  isAutoSaveEnabled,
  type EditorType,
} from '@/lib/feature-flags'
import {
  EditorEvents,
  trackEditor,
  captureError,
} from '@/lib/analytics'

const PAGE_TYPE = 'new-post'

export default function NewPostPage() {
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const richEditorRef = useRef<RichTextEditorHandle>(null)
  const markdownEditorRef = useRef<MarkdownEditorHandle>(null)
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [editorHeight, setEditorHeight] = useState(600)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const { data: channels } = useChannels()

  const [editorType, setEditorType] = useState<EditorType>('rich-text')
  const [editorInitialized, setEditorInitialized] = useState(false)

  const userId = user?.id ?? ''

  const autosaveDisabled = !isAutoSaveEnabled()
  const autosave = useAutosave({
    userId,
    page: 'new',
    editorType,
    disabled: autosaveDisabled,
  })

  const { state: autosaveState, snapshot: draftSnapshot, patch, initializeNew, markServerSynced, pause: pauseAutosave, resume: resumeAutosave } = autosave
  const {
    saveStatus,
    lastSavedAt,
    isDirty,
    loaded: autosaveLoaded,
    conflictMessage,
    conflictDecision,
  } = autosaveState

  useEffect(() => {
    if (!hasHydrated || !userId) return
    void initializeNew(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, userId])

  // 草稿恢复回填到表单
  useEffect(() => {
    if (!autosaveLoaded || !draftSnapshot) return
    setTitle((prev) => prev || draftSnapshot.title)
    setContent((prev) => prev || draftSnapshot.content)
    setContentDoc((prev) => {
      const empty = emptyContentDoc
      if (JSON.stringify(prev) === JSON.stringify(empty)) {
        return draftSnapshot.contentDoc ?? prev
      }
      return prev
    })
    setChannel((prev) => (prev === 'general' && draftSnapshot.channel && draftSnapshot.channel !== 'general' ? draftSnapshot.channel : prev))
    setTagsInput((prev) => (prev.trim() === '' ? draftSnapshot.tags.join(', ') : prev))
    setAiSummary((prev) => prev || draftSnapshot.aiSummary)
    setFont((prev) => (prev === 'default' ? (draftSnapshot.font || 'default') : prev))
    setCoverUrl((prev) => prev || draftSnapshot.coverUrl)
  }, [autosaveLoaded, draftSnapshot])

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
      status: 'draft',
    }),
    [title, content, contentDoc, channel, aiSummary, font, coverUrl, parseTags],
  )

  // 字段变化时同步 patch 到 autosave
  useEffect(() => {
    if (!autosaveLoaded || autosaveDisabled) return
    patch(currentDraftData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, contentDoc, channel, tagsInput, aiSummary, font, coverUrl, autosaveLoaded, autosaveDisabled])

  useEffect(() => {
    if (editorInitialized) return
    if (!autosaveLoaded) return
    const richEnabled = isRichTextEditorEnabled()
    const def = getDefaultEditor()
    const hasDoc = draftSnapshot && draftSnapshot.contentDoc && (draftSnapshot.contentDoc.content?.length ?? 0) > 0
    // 新建帖：draft 恢复优先（有内容doc 或明确标记），否则走 FeatureFlags
    const richPreferredByDraft = !!hasDoc
    const richDefault = richEnabled && def === 'rich-text'
    const initial: EditorType = richDefault
      ? (richPreferredByDraft ? 'rich-text' : 'rich-text')
      : 'markdown'
    setEditorType(initial)
    setEditorInitialized(true)
    trackEditor(EditorEvents.EditorLoad, {
      editorType: initial,
      pageType: PAGE_TYPE,
      richTextEnabled: richEnabled,
      downgradeAllowed: isEditorDowngradeAllowed(),
      fromDraft: !!draftSnapshot,
      autosaveEnabled: !autosaveDisabled,
    })
  }, [editorInitialized, autosaveLoaded, draftSnapshot, autosaveDisabled])

  useEffect(() => {
    const updateHeight = () => setEditorHeight(window.innerHeight - (window.innerWidth < 768 ? 200 : 270))
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

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
      captureError(err, { component: 'NewPostPage.resolveCover', editorType, pageType: PAGE_TYPE })
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

  const handleSaveDraft = async () => {
    if (!content.trim()) {
      toast.error('内容为空，无法保存草稿')
      return
    }
    if (!validatePostLimits()) return
    trackEditor(EditorEvents.SaveDraftStart, { editorType, pageType: PAGE_TYPE })
    setSavingDraft(true)
    try {
      await autosave.forceSave()
      const tags = parseTags()
      const resolved = await resolveEditorImages()
      const cover = await resolveCover()
      const syncContentDoc = isContentDocSyncEnabled()
      const post = await api.post<Post>('/posts', {
        title: title.trim(),
        content: resolved.markdown || content,
        contentDoc: syncContentDoc ? (resolved.doc || contentDoc) : undefined,
        channel,
        tags: tags.length > 0 ? tags : undefined,
        status: 'draft',
        aiSummary: aiSummary.trim() || undefined,
        font,
        coverUrl: cover,
        contentDocEnabled: syncContentDoc,
        editorDowngraded: editorType === 'markdown' && isRichTextEditorEnabled(),
      })
      await markServerSynced(post.updatedAt)
      trackEditor(EditorEvents.SaveDraftSuccess, { editorType, pageType: PAGE_TYPE, postId: post.id })
      toast.success('草稿已保存')
      router.replace(`/community/post/${post.id}/edit`)
    } catch (e) {
      captureError(e, { component: 'NewPostPage.handleSaveDraft', editorType, pageType: PAGE_TYPE })
      trackEditor(EditorEvents.SaveDraftError, { editorType, pageType: PAGE_TYPE, error: e instanceof Error ? e.message : String(e) })
      toast.error(e instanceof ApiError ? e.message : '保存草稿失败')
    } finally {
      setSavingDraft(false)
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
    trackEditor(EditorEvents.PublishStart, { editorType, pageType: PAGE_TYPE })
    setPublishing(true)
    pauseAutosave()
    try {
      await autosave.forceSave()
      const tags = parseTags()
      const resolved = await resolveEditorImages()
      const cover = await resolveCover()
      const syncContentDoc = isContentDocSyncEnabled()
      const post = await api.post<Post>('/posts', {
        title: title.trim(),
        content: resolved.markdown || content,
        contentDoc: syncContentDoc ? (resolved.doc || contentDoc) : undefined,
        channel,
        tags: tags.length > 0 ? tags : undefined,
        status: 'published',
        aiSummary: aiSummary.trim() || undefined,
        font,
        coverUrl: cover,
        contentDocEnabled: syncContentDoc,
        editorDowngraded: editorType === 'markdown' && isRichTextEditorEnabled(),
      })
      await markServerSynced(post.updatedAt)
      trackEditor(EditorEvents.PublishSuccess, { editorType, pageType: PAGE_TYPE, postId: post.id })
      toast.success('发布成功')
      router.push(`/community/post/${post.id}`)
    } catch (e) {
      captureError(e, { component: 'NewPostPage.handlePublish', editorType, pageType: PAGE_TYPE })
      trackEditor(EditorEvents.PublishError, { editorType, pageType: PAGE_TYPE, error: e instanceof Error ? e.message : String(e) })
      toast.error(e instanceof ApiError ? e.message : '发布失败，请重试')
      resumeAutosave()
    } finally {
      setPublishing(false)
    }
  }

  const handleSwitchEditor = async (target: EditorType) => {
    if (target === editorType) return
    trackEditor(EditorEvents.EditorSwitch, {
      editorType,
      pageType: PAGE_TYPE,
      targetEditor: target,
    })
    try {
      if (target === 'markdown') {
        trackEditor(EditorEvents.EditorDowngrade, { editorType: 'rich-text', pageType: PAGE_TYPE })
        const currentMarkdown = content || tiptapDocToMarkdown(contentDoc)
        setContent(currentMarkdown)
      } else {
        trackEditor(EditorEvents.EditorUpgrade, { editorType: 'markdown', pageType: PAGE_TYPE })
        const doc = markdownToTiptapDoc(content)
        setContentDoc(doc)
      }
      setEditorType(target)
    } catch (e) {
      captureError(e, {
        component: 'NewPostPage.handleSwitchEditor',
        editorType,
        pageType: PAGE_TYPE,
        extra: { target },
      })
      trackEditor(EditorEvents.EditorSwitchFallback, {
        editorType,
        pageType: PAGE_TYPE,
        targetEditor: target,
        error: e instanceof Error ? e.message : String(e),
        fallbackEditor: editorType,
      })
      toast.error('编辑器切换失败，已保留当前模式')
    }
  }

  if (!hasHydrated || !token) {
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
        <h1 className="text-base font-semibold">发布新帖</h1>
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
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            dirty={isDirty}
          />
        </div>
      </div>
      {conflictMessage && (
        <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {conflictMessage}
        </div>
      )}
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
            trackEditor(EditorEvents.FontChange, { editorType, pageType: PAGE_TYPE, font: key })
          }}
          placeholder="尽情写作吧…"
          pageType="new-post"
          toolbarEnd={
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={savingDraft || !content.trim()}
                onClick={handleSaveDraft}
              >
                {savingDraft ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
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
            trackEditor(EditorEvents.FontChange, { editorType, pageType: PAGE_TYPE, font: key })
          }}
          placeholder="尽情写作吧…（支持 Markdown）"
          toolbarEnd={
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={savingDraft || !content.trim()}
                onClick={handleSaveDraft}
              >
                {savingDraft ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
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
          }
        />
      )}

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
        submitting={publishing}
        onConfirm={handlePublish}
      />

      {conflictDecision && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 shrink-0 text-amber-500" />
              <div>
                <h2 className="text-lg font-semibold">检测到草稿冲突</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  服务器端的帖子已更新，而本地草稿也有未同步的改动。请选择如何处理：
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>• 本地草稿更新时间：{formatSaveTime(conflictDecision.localUpdatedAt)}</li>
                  <li>• 服务器更新时间：{formatSaveTime(conflictDecision.serverUpdatedAt)}</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => conflictDecision.onChoice('accept-server')}
              >
                采用服务器版本
              </Button>
              <Button
                type="button"
                onClick={() => conflictDecision.onChoice('use-local')}
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
