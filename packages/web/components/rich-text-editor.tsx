'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Braces, Code, Eraser, FileText, Heading2, Image as ImageIcon, Italic, Link2, List,
  ListChecks, ListOrdered, Loader2, Mic, MoreHorizontal, Quote, Redo2, Sparkles, Strikethrough,
  Type, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { VoiceComposer } from '@/app/community/components/voice-composer'
import { api, apiFetch, apiFetchStream, ApiError } from '@/lib/api'
import { convertDocxToMarkdown, isDocxFile, isLegacyDocFile } from '@/lib/docx-import'
import { FONT_OPTIONS, fontFamily } from '@/lib/font-options'
import { cn } from '@/lib/utils'
import { polishContent } from '@/lib/polish-api'
import {
  contentExtensions, contentDocText, countContentImages, ensureDocBlockIds, markdownToTiptapDoc,
  protectMarkdownForRewrite, replaceContentImageSources, sanitizeDocBlockIds, tiptapBlockToMarkdown, tiptapDocToMarkdown,
} from '@/lib/content-projection'
import { isValidBlockId } from '@/lib/block-id'
import { BLOCK_ID_TYPES } from '@/lib/anchorable-blocks'
import { compressImage, MAX_POST_CHARS, MAX_POST_IMAGES } from '@/components/markdown-editor'
import { BubbleMenu } from '@/components/editor/bubble-menu'
import { SlashMenu } from '@/components/editor/slash-menu'
import { OutlineView } from '@/components/editor/outline-view'
import { AiDiffPanel } from '@/components/editor/ai-diff-panel'
import { AiBlockDiffPanel } from '@/components/editor/ai-block-diff-panel'
import { createAiDiffBlocks, hashAiDiffSource, type AiDiffBlock } from '@/lib/ai-diff-workflow'
import { MobileInsertSheet, MobileToolbar, useVirtualKeyboard } from '@/components/editor/mobile-toolbar'
import {
  isAiDiffReviewEnabled,
  isBubbleMenuEnabled,
  isOutlineViewEnabled,
  isSlashMenuEnabled,
} from '@/lib/feature-flags'
import { captureError, trackEditor, EditorEvents } from '@/lib/analytics'

/** 安全包装：BubbleMenu 出错时仅降级不渲染，不影响主编辑器 */
function SafeBubbleMenu(props: React.ComponentProps<typeof BubbleMenu>) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  try {
    return <BubbleMenu {...props} />
  } catch (e) {
    if (!errored) {
      captureError(e, { component: 'SafeBubbleMenu.wrap' })
      queueMicrotask(() => setErrored(true))
    }
    return null
  }
}

/** 安全包装：SlashMenu 出错时仅降级不渲染，不影响主编辑器 */
function SafeSlashMenu(props: React.ComponentProps<typeof SlashMenu>) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  try {
    return <SlashMenu {...props} />
  } catch (e) {
    if (!errored) {
      captureError(e, { component: 'SafeSlashMenu.wrap' })
      queueMicrotask(() => setErrored(true))
    }
    return null
  }
}

export interface RichTextEditorHandle {
  resolveImages: () => Promise<{ doc: JSONContent; markdown: string }>
}

interface RichTextEditorProps {
  value: JSONContent
  onChange: (doc: JSONContent, markdown: string) => void
  placeholder?: string
  height?: number
  className?: string
  toolbarEnd?: React.ReactNode
  font?: string
  onFontChange?: (key: string) => void
  onAnnotationFromSelection?: () => void
  outlineClassName?: string
  /** 页面类型（用于埋点） */
  pageType?: 'new-post' | 'edit-post'
  /** 帖子 ID（编辑时可传，用于埋点/ai-diff） */
  postId?: string
}

interface ToolbarAction {
  label: string
  icon: React.ReactNode
  active?: boolean
  disabled?: boolean
  run: () => void
}

function ToolbarButton({ action, className }: { action: ToolbarAction; className?: string }) {
  return (
    <Button
      type="button"
      variant={action.active ? 'secondary' : 'ghost'}
      size="icon"
      className={cn('size-8 shrink-0', className)}
      disabled={action.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action.run}
      title={action.label}
      aria-label={action.label}
      aria-pressed={action.active}
    >
      {action.icon}
    </Button>
  )
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  value,
  onChange,
  placeholder = '开始写作…',
  height = 400,
  className,
  toolbarEnd,
  font = FONT_OPTIONS[0].key,
  onFontChange,
  onAnnotationFromSelection,
  outlineClassName,
  pageType = 'new-post',
  postId,
}, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docxInputRef = useRef<HTMLInputElement>(null)
  const localImagesRef = useRef<Map<string, File>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const [polishing, setPolishing] = useState(false)
  const [polishProgress, setPolishProgress] = useState<{ done: number; total: number } | null>(null)
  const [originalSnapshot, setOriginalSnapshot] = useState<JSONContent | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [insertSheetOpen, setInsertSheetOpen] = useState(false)
  /** AI Diff 审阅面板的输入源快照：当有值时，在编辑器下方渲染 AiDiffPanel */
  const [aiDiffPolishInput, setAiDiffPolishInput] = useState<null | {
    originalMarkdown: string
    selectionText?: string
    selection?: { from: number; to: number }
    snapshot: JSONContent
    blocks: ReturnType<typeof createAiDiffBlocks>
  }>(null)

  // feature flags：读取一次并容错，失败时走保守降级（视为关闭，但不影响主功能）
  const featureFlags = useMemo(() => {
    try {
      return {
        aiDiffReview: isAiDiffReviewEnabled(),
        bubbleMenu: isBubbleMenuEnabled(),
        slashMenu: isSlashMenuEnabled(),
        outlineView: isOutlineViewEnabled(),
      }
    } catch (e) {
      captureError(e, { component: 'RichTextEditor.featureFlags' })
      return { aiDiffReview: false, bubbleMenu: false, slashMenu: false, outlineView: false }
    }
  }, [])
  const isComposingRef = useRef(false)

  valueRef.current = value
  onChangeRef.current = onChange

  const { keyboardOpen, keyboardHeight, safeAreaBottom } = useVirtualKeyboard(containerRef)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...contentExtensions,
      Placeholder.configure({ placeholder }),
    ],
    content: ensureDocBlockIds(value),
    editorProps: {
      attributes: {
        class: 'tiptap-editor prose prose-sm dark:prose-invert max-w-none min-h-full focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
        if (files.length === 0) return false
        event.preventDefault()
        void insertImageFiles(files)
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        const docx = files.find((file) => isDocxFile(file) || isLegacyDocFile(file))
        if (docx) {
          event.preventDefault()
          void importDocx(docx)
          return true
        }
        const images = files.filter((file) => file.type.startsWith('image/'))
        if (images.length === 0) return false
        event.preventDefault()
        void insertImageFiles(images)
        return true
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      const dom = currentEditor.view.dom as HTMLElement | undefined
      if (!dom) return
      const onCompositionStart = () => { isComposingRef.current = true }
      const onCompositionEnd = () => { isComposingRef.current = false }
      dom.addEventListener('compositionstart', onCompositionStart)
      dom.addEventListener('compositionend', onCompositionEnd)
      ;(currentEditor as unknown as { __imeCleanup?: () => void }).__imeCleanup = () => {
        dom.removeEventListener('compositionstart', onCompositionStart)
        dom.removeEventListener('compositionend', onCompositionEnd)
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      const json = currentEditor.getJSON()
      // 输入法合成中：跳过 blockId 强制写入，直接通知
      if (isComposingRef.current) {
        onChangeRef.current(json, tiptapDocToMarkdown(json))
        return
      }
      // 快速检查：是否有 block 缺少 blockId（仅结构性变化才需要 ensure）
      const needsEnsure = (() => {
        let found = false
        const walk = (n: JSONContent) => {
          if (found) return
          if (BLOCK_ID_TYPES.has(n.type ?? '') && !isValidBlockId(n.attrs?.blockId)) {
            found = true
            return
          }
          for (const c of n.content ?? []) walk(c)
        }
        walk(json)
        return found
      })()
      const finalDoc = needsEnsure ? ensureDocBlockIds(json) : json
      if (needsEnsure) {
        currentEditor.commands.setContent(finalDoc, { emitUpdate: false })
      }
      valueRef.current = finalDoc
      onChangeRef.current(finalDoc, tiptapDocToMarkdown(finalDoc))
    },
  })

  useEffect(() => {
    if (!editor) return
    const timer = window.setTimeout(() => {
      const current = editor.getJSON()
      // 加载后修复重复和非法 blockId，再补齐缺失
      const { doc: sanitized, repaired } = sanitizeDocBlockIds(current)
      const ensured = ensureDocBlockIds(sanitized)
      if (repaired || JSON.stringify(current) !== JSON.stringify(ensured)) {
        editor.commands.setContent(ensured, { emitUpdate: false })
      }
    }, 0)
    return () => {
      window.clearTimeout(timer)
      // 兜底：tiptap 的 useEditor 销毁时不暴露 onBeforeDestroy，这里在 effect cleanup 时手动释放 IME 监听
      try {
        (editor as unknown as { __imeCleanup?: () => void }).__imeCleanup?.()
      } catch {
        /* ignore */
      }
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    // 外部值变更时先修复重复/非法 ID 再补齐缺失
    const { doc: sanitized } = sanitizeDocBlockIds(value)
    const ensured = ensureDocBlockIds(sanitized)
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(ensured)) {
      editor.commands.setContent(ensured, { emitUpdate: false })
    }
  }, [editor, value])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!polishing)
  }, [editor, polishing])

  const charCount = useMemo(() => [...contentDocText(value)].length, [value])
  const imageCount = useMemo(() => countContentImages(value), [value])

  const insertImageFiles = async (files: File[]) => {
    if (!editor || polishing) return
    const images = files.filter((file) => file.type.startsWith('image/'))
    const available = Math.max(0, MAX_POST_IMAGES - countContentImages(editor.getJSON()))
    const accepted = images.slice(0, available)
    if (accepted.length < images.length) {
      toast.error(available === 0 ? `最多插入 ${MAX_POST_IMAGES} 张图片` : `最多还能插入 ${available} 张图片`)
    }
    for (let file of accepted) {
      if (file.size > 5 * 1024 * 1024) {
        toast.info('图片超过 5MB，已自动压缩')
        file = await compressImage(file, 2560, 0.92)
      }
      const blobUrl = URL.createObjectURL(file)
      localImagesRef.current.set(blobUrl, file)
      editor.chain().focus().setImage({ src: blobUrl, alt: file.name || '图片' }).run()
    }
  }

  const resolveImages = useCallback(async () => {
    let doc = valueRef.current
    const replacements = new Map<string, string>()
    const activeMarkdown = tiptapDocToMarkdown(doc)
    for (const [blobUrl, file] of localImagesRef.current) {
      if (!activeMarkdown.includes(blobUrl)) {
        URL.revokeObjectURL(blobUrl)
        localImagesRef.current.delete(blobUrl)
        continue
      }
      try {
        const uploadFile = file.size > 1024 * 1024 ? await compressImage(file, 2560, 0.92) : file
        const formData = new FormData()
        formData.append('file', uploadFile)
        const data = await apiFetch<{ url: string }>('/upload/image', { method: 'POST', body: formData })
        replacements.set(blobUrl, data.url)
      } catch (error) {
        if (replacements.size > 0) {
          doc = replaceContentImageSources(doc, replacements)
          valueRef.current = doc
          editor?.commands.setContent(doc, { emitUpdate: false })
          onChangeRef.current(doc, tiptapDocToMarkdown(doc))
          for (const blobUrl of replacements.keys()) {
            URL.revokeObjectURL(blobUrl)
            localImagesRef.current.delete(blobUrl)
          }
        }
        toast.error(error instanceof ApiError ? error.message : '图片上传失败')
        throw error
      }
    }
    if (replacements.size > 0) {
      doc = replaceContentImageSources(doc, replacements)
      valueRef.current = doc
      editor?.commands.setContent(doc, { emitUpdate: false })
      onChangeRef.current(doc, tiptapDocToMarkdown(doc))
      for (const blobUrl of replacements.keys()) {
        URL.revokeObjectURL(blobUrl)
        localImagesRef.current.delete(blobUrl)
      }
    }
    return { doc, markdown: tiptapDocToMarkdown(doc) }
  }, [editor])

  useImperativeHandle(ref, () => ({ resolveImages }))

  const importDocx = async (file: File) => {
    if (isLegacyDocFile(file) && !isDocxFile(file)) {
      toast.error('不支持 .doc 格式，请另存为 .docx 后重试')
      return
    }
    if (!editor || polishing) return
    setImporting(true)
    try {
      const { markdown, images, skippedTypes } = await convertDocxToMarkdown(file)
      const available = Math.max(0, MAX_POST_IMAGES - countContentImages(editor.getJSON()))
      const acceptedImages = images.slice(0, available)
      let resolvedMarkdown = markdown
      for (const image of acceptedImages) {
        let uploadFile = image.file
        if (uploadFile.size > 5 * 1024 * 1024) uploadFile = await compressImage(uploadFile, 2560, 0.92)
        const blobUrl = URL.createObjectURL(uploadFile)
        localImagesRef.current.set(blobUrl, uploadFile)
        resolvedMarkdown = resolvedMarkdown.replaceAll(image.placeholder, blobUrl)
      }
      for (const image of images.slice(available)) resolvedMarkdown = resolvedMarkdown.replaceAll(image.placeholder, '')
      editor.chain().focus().insertContent(markdownToTiptapDoc(resolvedMarkdown).content ?? []).run()
      toast.success(acceptedImages.length > 0 ? `已导入文档，含 ${acceptedImages.length} 张图片` : '已导入文档')
      if (acceptedImages.length < images.length) toast.warning(`图片已达到 ${MAX_POST_IMAGES} 张上限，超出部分未插入`)
      if (skippedTypes.length > 0) toast.warning(`${skippedTypes.length} 类图片无法导入`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Word 文档导入失败')
    } finally {
      setImporting(false)
    }
  }

  const setLink = () => {
    if (!editor) return
    const current = editor.getAttributes('link').href as string | undefined
    const href = window.prompt('链接地址', current ?? 'https://')
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
  }

  const handlePolish = async () => {
    if (!editor || polishing) return
    const { from, to } = editor.state.selection
    const snapshot = editor.getJSON()
    const markdown = tiptapDocToMarkdown(snapshot)
    const selectionText = from !== to ? editor.state.doc.textBetween(from, to, '\n') : ''
    if (!selectionText && !markdown.trim()) {
      toast.error('请先输入内容')
      return
    }
    if (selectionText && selectionText.trim().length < 2) {
      toast.error('选段内容太短')
      return
    }
    // 当关闭 AI Diff review flag 时，使用旧的直接改写流程
    if (!featureFlags.aiDiffReview) {
      let selectionContainsNonText = false
      if (selectionText) {
        editor.state.doc.nodesBetween(from, to, (node) => {
          if (node.type.name === 'image' || node.type.name === 'horizontalRule' || node.type.name === 'codeBlock') {
            selectionContainsNonText = true
          }
        })
        if (selectionContainsNonText) {
          toast.error('选段包含图片、分隔线或代码块，请仅选择文字内容')
          return
        }
      }
      setPolishing(true)
      try {
        const polished = await polishContent({
          content: markdown,
          selection: selectionText || undefined,
          style: '',
          onProgress: setPolishProgress,
        })
        const candidateDoc = markdownToTiptapDoc(polished)
        if (selectionText) {
          editor.chain().focus().insertContentAt({ from, to }, candidateDoc.content ?? []).run()
        } else {
          editor.commands.setContent(candidateDoc)
        }
        setOriginalSnapshot(snapshot)
        toast.success(selectionText ? '已应用 AI 润色' : '已完成 AI 润色')
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'AI 润色失败')
      } finally {
        setPolishing(false)
        setPolishProgress(null)
      }
      return
    }
    // 开启 review 流程：点击“AI 润色”只是把当前正文（或选区）的原始值准备好，并展开 Diff 面板，真正请求由 DiffPanel 触发
    setAiDiffPolishInput({
      originalMarkdown: markdown,
      selectionText: selectionText || undefined,
      selection: selectionText ? { from, to } : undefined,
      snapshot,
      blocks: createAiDiffBlocks(
        (snapshot.content ?? [])
          .filter((node) => typeof node.attrs?.blockId === 'string')
          .map((node) => ({
            blockId: node.attrs?.blockId as string,
            originalMarkdown: tiptapBlockToMarkdown(node),
          })),
      ),
    })
    setOriginalSnapshot(snapshot)
    // 埋点：打开润色面板
    trackEditor(EditorEvents.PolishPanelOpen, {
      pageType,
      postId,
      scope: selectionText ? 'selection' : 'full',
    })
  }

  // AiDiffPanel 侧的 regenerate 回调：真实调用 AI 并返回最终 markdown 结果
  const handleRegenerate = useCallback(async (style: string) => {
    if (!aiDiffPolishInput) throw new Error('润色请求尚未就绪')
    let receivedSelection = aiDiffPolishInput.selectionText
    // 如果选区包含非纯文字节点，强制走全文
    if (aiDiffPolishInput.selection && editor) {
      editor.state.doc.nodesBetween(aiDiffPolishInput.selection.from, aiDiffPolishInput.selection.to, (node) => {
        if (node.type.name === 'image' || node.type.name === 'horizontalRule' || node.type.name === 'codeBlock') {
          receivedSelection = undefined
        }
      })
      if (!receivedSelection) {
        toast.warning('选段包含图片/分隔线/代码块，已切换为全文润色')
      }
    }
    return polishContent({
      content: aiDiffPolishInput.originalMarkdown,
      selection: receivedSelection,
      style,
      onProgress: setPolishProgress,
    })
  }, [aiDiffPolishInput, editor])

  // AiDiffPanel：用户“采纳修改”后，将 markdown 结果写回 editor（选区/全文）
  const handleApplyMarkdown = useCallback((nextMd: string) => {
    if (!editor || !aiDiffPolishInput) return
    const nextDoc = markdownToTiptapDoc(nextMd)
    if (aiDiffPolishInput.selection) {
      editor.chain().focus().insertContentAt(aiDiffPolishInput.selection, nextDoc.content ?? []).run()
    } else {
      editor.commands.setContent(nextDoc)
    }
    setOriginalSnapshot(aiDiffPolishInput.snapshot)
  }, [editor, aiDiffPolishInput])

  const replaceBlockPreservingId = useCallback((blockId: string, polishedMarkdown: string): 'accepted' | 'failed' | 'stale' => {
    if (!editor) return 'failed'
    let targetPos: number | null = null
    let targetNode: { nodeSize: number; type: { name: string }; attrs: Record<string, unknown> } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (targetNode || !node.isBlock || node.attrs.blockId !== blockId) return !targetNode
      targetNode = node
      targetPos = pos
      return false
    })
    if (!targetNode || targetPos === null) return 'stale'
    const from = targetPos as number
    const nodeSize = (targetNode as { nodeSize: number }).nodeSize
    const replacement = markdownToTiptapDoc(polishedMarkdown).content ?? []
    // 结构约束：润色结果必须恰好对应一个块
    if (replacement.length === 0) return 'failed'
    if (replacement.length > 1) return 'failed'
    const next = replacement[0]
    if (!next.type) return 'failed'
    // 类型约束：不允许改变块类型（paragraph 不能变成 list 等）
    const originalType = (targetNode as { type: { name: string } }).type.name
    if (next.type !== originalType) return 'failed'
    const attrs = { ...(next.attrs ?? {}), blockId }
    const nextNode = editor.schema.nodeFromJSON({ ...next, attrs })
    editor.view.dispatch(editor.state.tr.replaceWith(from, from + nodeSize, nextNode))
    return 'accepted'
  }, [editor])

  const aiBlocks = useMemo(() => {
    if (!aiDiffPolishInput) return []
    return aiDiffPolishInput.blocks
  }, [aiDiffPolishInput])

  const handleGenerateBlock = useCallback(async (blockId: string, originalBlockMarkdown: string, style: string, signal: AbortSignal) => {
    return polishContent({ content: originalBlockMarkdown, style, signal })
  }, [])

  const handleApplyBlock = useCallback((block: AiDiffBlock): 'accepted' | 'failed' | 'stale' => {
    const result = replaceBlockPreservingId(block.blockId, block.polishedMarkdown)
    if (result === 'accepted') {
      setAiDiffPolishInput((current) => current ? {
        ...current,
        originalMarkdown: tiptapDocToMarkdown(editor?.getJSON() ?? current.snapshot),
      } : current)
    }
    return result
  }, [editor, replaceBlockPreservingId])

  const handleCheckBlockFreshness = useCallback((blockId: string, sourceVersion: string): boolean => {
    if (!editor) return false
    let currentText = ''
    editor.state.doc.descendants((node) => {
      if (currentText) return false
      if (node.isBlock && node.attrs.blockId === blockId) {
        currentText = node.textContent ?? ''
        return false
      }
      return true
    })
    if (!currentText) return false
    return hashAiDiffSource(currentText) === sourceVersion
  }, [editor])

  // 整体放弃 AiDiff：清空面板
  const handleDiscardAiDiff = useCallback(() => {
    setAiDiffPolishInput(null)
    trackEditor(EditorEvents.PolishDiscard, { pageType, postId })
  }, [pageType, postId])

  if (!editor) return <div className={cn('rounded-lg border bg-card', className)} style={{ height }} />

  const commonActions: ToolbarAction[] = [
    { label: '撤销', icon: <Undo2 className="size-4" />, disabled: polishing || !editor.can().undo(), run: () => editor.chain().focus().undo().run() },
    { label: '重做', icon: <Redo2 className="size-4" />, disabled: polishing || !editor.can().redo(), run: () => editor.chain().focus().redo().run() },
    { label: '二级标题', icon: <Heading2 className="size-4" />, active: editor.isActive('heading', { level: 2 }), disabled: polishing, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: '粗体', icon: <Bold className="size-4" />, active: editor.isActive('bold'), disabled: polishing, run: () => editor.chain().focus().toggleBold().run() },
    { label: '斜体', icon: <Italic className="size-4" />, active: editor.isActive('italic'), disabled: polishing, run: () => editor.chain().focus().toggleItalic().run() },
    { label: '删除线', icon: <Strikethrough className="size-4" />, active: editor.isActive('strike'), disabled: polishing, run: () => editor.chain().focus().toggleStrike().run() },
    { label: '链接', icon: <Link2 className="size-4" />, active: editor.isActive('link'), disabled: polishing, run: setLink },
    { label: '无序列表', icon: <List className="size-4" />, active: editor.isActive('bulletList'), disabled: polishing, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: '有序列表', icon: <ListOrdered className="size-4" />, active: editor.isActive('orderedList'), disabled: polishing, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: '任务列表', icon: <ListChecks className="size-4" />, active: editor.isActive('taskList'), disabled: polishing, run: () => editor.chain().focus().toggleTaskList().run() },
    { label: '引用', icon: <Quote className="size-4" />, active: editor.isActive('blockquote'), disabled: polishing, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: '行内代码', icon: <Code className="size-4" />, active: editor.isActive('code'), disabled: polishing, run: () => editor.chain().focus().toggleCode().run() },
    { label: '代码块', icon: <Braces className="size-4" />, active: editor.isActive('codeBlock'), disabled: polishing, run: () => editor.chain().focus().toggleCodeBlock().run() },
  ]

  const mobileActions = commonActions.slice(2, 7)
  const desktopActions = commonActions

  return (
    <div ref={containerRef} className={cn('w-full space-y-2', className)}>
      <div className="overflow-hidden rounded-lg border border-input bg-card">
        <div className="flex items-center gap-1 border-b bg-muted/50 p-1.5">
          <div className="hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
            {desktopActions.map((action) => <ToolbarButton key={action.label} action={action} />)}
          </div>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto md:hidden">
            {mobileActions.map((action) => <ToolbarButton key={action.label} action={action} className="size-10" />)}
          </div>
          <ToolbarButton action={{ label: '插入图片', icon: <ImageIcon className="size-4" />, disabled: polishing || imageCount >= MAX_POST_IMAGES, run: () => fileInputRef.current?.click() }} className="max-md:size-10" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs text-primary max-md:size-10 max-md:px-0"
            disabled={polishing}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handlePolish}
            title="选中文字润色选段，未选中时润色全文"
            aria-label="AI 润色"
          >
            {polishing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            <span className="hidden md:inline">{polishProgress ? `润色 ${Math.round(polishProgress.done / polishProgress.total * 100)}%` : 'AI 润色'}</span>
          </Button>
          <Button
            type="button"
            variant={showOutline ? 'secondary' : 'ghost'}
            size="icon"
            className="size-8 shrink-0 max-md:hidden disabled:opacity-50"
            onClick={() => setShowOutline((v) => !v)}
            title={featureFlags.outlineView ? '显示/隐藏大纲' : '当前环境未开启大纲'}
            aria-label="大纲"
            disabled={!featureFlags.outlineView}
          >
            <List className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 md:hidden" title="更多工具" aria-label="更多工具">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>更多工具</DropdownMenuLabel>
              {commonActions.filter((action) => !mobileActions.includes(action)).map((action) => (
                <DropdownMenuItem key={action.label} onSelect={action.run}>{action.icon}{action.label}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={polishing || importing} onSelect={() => docxInputRef.current?.click()}><FileText />导入 Word</DropdownMenuItem>
              <DropdownMenuItem disabled={polishing} onSelect={() => setVoiceOpen(true)}><Mic />语音输入</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden items-center gap-1 md:flex">
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={polishing || importing} onClick={() => docxInputRef.current?.click()} title="导入 Word" aria-label="导入 Word">
              {importing ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={polishing} onClick={() => setVoiceOpen(true)} title="语音输入" aria-label="语音输入"><Mic className="size-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" disabled={polishing} title="全文字体" aria-label="全文字体"><Type className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {FONT_OPTIONS.map((option) => <DropdownMenuItem key={option.key} onSelect={() => onFontChange?.(option.key)} style={{ fontFamily: option.family }}>{option.name}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" disabled={polishing} onClick={() => { if (window.confirm('确定清空全部内容吗？')) editor.commands.clearContent() }} title="清空内容" aria-label="清空内容"><Eraser className="size-4" /></Button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 border-l pl-2">
            <span className={cn('hidden text-xs tabular-nums sm:inline', imageCount > MAX_POST_IMAGES ? 'font-medium text-destructive' : 'text-muted-foreground')}>{imageCount}/{MAX_POST_IMAGES} 图</span>
            <span className={cn('hidden text-xs tabular-nums sm:inline', charCount > MAX_POST_CHARS ? 'font-medium text-destructive' : 'text-muted-foreground')}>{charCount.toLocaleString()}/{MAX_POST_CHARS.toLocaleString()}</span>
            {toolbarEnd}
          </div>
        </div>
        {polishing && <div className="h-0.5 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: polishProgress ? `${polishProgress.done / polishProgress.total * 100}%` : '25%' }} /></div>}
        <div className="flex">
          <div
            className="flex-1 overflow-y-auto bg-background px-5 py-4 sm:px-8 sm:py-6"
            style={{
              height,
              fontFamily: fontFamily(font),
              paddingBottom: keyboardOpen ? `${Math.max(20, keyboardHeight - 180 + safeAreaBottom)}px` : undefined,
            }}
          >
            <EditorContent editor={editor} />
          </div>
          {showOutline && featureFlags.outlineView && (
            <div className={cn('hidden w-60 shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-2 md:block', outlineClassName)}>
              <OutlineView editor={editor} />
            </div>
          )}
        </div>
      </div>
      {featureFlags.bubbleMenu ? (
        <SafeBubbleMenu editor={editor} onAnnotation={onAnnotationFromSelection} />
      ) : null}
      {featureFlags.slashMenu ? (
        <SafeSlashMenu editor={editor} onInsertImageFiles={insertImageFiles} />
      ) : null}
      {originalSnapshot && !aiDiffPolishInput && (
        <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-primary"><Sparkles className="size-3" />已应用 AI 润色</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => { editor.commands.setContent(originalSnapshot); setOriginalSnapshot(null); setAiDiffPolishInput(null) }}><Undo2 className="size-3" />恢复原稿</Button>
        </div>
      )}
      {featureFlags.aiDiffReview && aiDiffPolishInput && (
        <div className="rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" />
              AI 润色审阅
              {aiDiffPolishInput.selection ? <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">选段</span> : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleDiscardAiDiff}
            >
              放弃
            </Button>
          </div>
          {aiBlocks.length > 0 && !aiDiffPolishInput.selection ? (
            <AiBlockDiffPanel
              key={aiDiffPolishInput.snapshot.content?.map((node) => node.attrs?.blockId).join(':')}
              initialBlocks={aiBlocks}
              pageType={pageType}
              postId={postId}
              onGenerateBlock={handleGenerateBlock}
              onApplyBlock={handleApplyBlock}
              onCheckBlockFreshness={handleCheckBlockFreshness}
              onRestoreSnapshot={() => {
                if (!editor) return
                editor.commands.setContent(aiDiffPolishInput.snapshot)
                setAiDiffPolishInput(null)
              }}
              onClose={handleDiscardAiDiff}
            />
          ) : (
            <AiDiffPanel
              originalMarkdown={aiDiffPolishInput.originalMarkdown}
              onApplyMarkdown={handleApplyMarkdown}
              pageType={pageType}
              postId={postId}
              reviewEnabled={true}
              onRegenerate={handleRegenerate}
              requesting={polishing}
              setRequesting={setPolishing}
              originalSnapshot={aiDiffPolishInput.snapshot}
              onRestoreSnapshot={() => {
                if (!editor) return
                editor.commands.setContent(aiDiffPolishInput.snapshot)
                setAiDiffPolishInput(null)
              }}
            />
          )}
        </div>
      )}
      {voiceOpen && <VoiceComposer target="paragraph" onInsert={(text: string) => editor.chain().focus().insertContent(markdownToTiptapDoc(text).content ?? []).run()} onClose={() => setVoiceOpen(false)} />}
      <MobileToolbar
        editor={editor}
        onImage={() => fileInputRef.current?.click()}
        onPolish={handlePolish}
        polishing={polishing}
        onInsertDocx={() => docxInputRef.current?.click()}
        onVoiceInput={() => setVoiceOpen(true)}
        onOpenInsertSheet={() => setInsertSheetOpen(true)}
        onOpenMore={() => setInsertSheetOpen(false)}
      />
      <MobileInsertSheet
        open={insertSheetOpen}
        onClose={() => setInsertSheetOpen(false)}
        onImage={() => fileInputRef.current?.click()}
        onDocx={() => docxInputRef.current?.click()}
        onVoice={() => setVoiceOpen(true)}
        onSlash={() => editor?.chain().focus().insertContent('/').run()}
      />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(event) => { void insertImageFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      <input ref={docxInputRef} type="file" accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importDocx(file) }} />
    </div>
  )
})
