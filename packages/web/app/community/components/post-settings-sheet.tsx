'use client'

import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CoverEditor } from '@/app/community/components/cover-editor'
import { cn } from '@/lib/utils'

export type PostSettingsMode = 'publish' | 'settings'

export interface PostSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PostSettingsMode
  titleRequired?: boolean
  confirmLabel: string
  title: string
  onTitleChange: (value: string) => void
  titleSuggestions: string[]
  onTitleSuggestionSelect: (title: string) => void
  channel: string
  onChannelChange: (channel: string) => void
  channelItems: Array<{ name: string; label: string }>
  coverUrl: string
  onCoverChange: (url: string, file: File | null) => void
  tagsInput: string
  onTagsInputChange: (value: string) => void
  aiSummary: string
  onAiSummaryChange: (value: string) => void
  enriching: boolean
  regenerating: 'title' | 'summary' | 'tags' | null
  onEnrichAll: () => void
  onRegenTitle: () => void
  onRegenTags: () => void
  onRegenSummary: () => void
  submitting: boolean
  onConfirm: () => void
}

export function PostSettingsSheet(props: PostSettingsSheetProps) {
  const {
    open,
    onOpenChange,
    mode,
    titleRequired = true,
    confirmLabel,
    title,
    onTitleChange,
    titleSuggestions,
    onTitleSuggestionSelect,
    channel,
    onChannelChange,
    channelItems,
    coverUrl,
    onCoverChange,
    tagsInput,
    onTagsInputChange,
    aiSummary,
    onAiSummaryChange,
    enriching,
    regenerating,
    onEnrichAll,
    onRegenTitle,
    onRegenTags,
    onRegenSummary,
    submitting,
    onConfirm,
  } = props

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={() => !submitting && onOpenChange(false)}
    >
      <div
        className="max-h-[92dvh] w-full space-y-5 overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{mode === 'publish' ? '发布设置' : '文章设置'}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ps-title">标题{titleRequired ? ' *' : ''}</Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                disabled={regenerating === 'title'}
                onClick={onRegenTitle}
                title="只重新生成标题"
              >
                {regenerating === 'title' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                换一批
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={enriching}
                onClick={onEnrichAll}
                title="根据内容一次生成标题、摘要和标签"
              >
                {enriching ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                {enriching ? '生成中…' : 'AI 补全'}
              </Button>
            </div>
          </div>
          <Input
            id="ps-title"
            placeholder="一句话概括你的想法"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            maxLength={100}
          />
          {titleSuggestions.length > 0 && (
            <div className="space-y-1 rounded-lg border bg-accent/50 p-2">
              <p className="px-1 text-xs text-muted-foreground">点击采用 AI 标题候选</p>
              {titleSuggestions.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onTitleSuggestionSelect(t)}
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
                  onClick={() => onChannelChange(ch.name)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {ch.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label>封面</Label>
            <span className="text-xs text-muted-foreground/60">推荐比例 16:9</span>
          </div>
          <CoverEditor coverUrl={coverUrl} onChange={onCoverChange} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ps-tags">标签</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              disabled={regenerating === 'tags'}
              onClick={onRegenTags}
              title="AI 推荐标签，添加到已有标签"
            >
              {regenerating === 'tags' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              AI 推荐
            </Button>
          </div>
          <Input
            id="ps-tags"
            placeholder="用逗号或空格分隔，最多 5 个标签"
            value={tagsInput}
            onChange={(e) => onTagsInputChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ps-summary">AI 摘要（可选）</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              disabled={regenerating === 'summary'}
              onClick={onRegenSummary}
              title="只重新生成摘要"
            >
              {regenerating === 'summary' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              换一批
            </Button>
          </div>
          <Textarea
            id="ps-summary"
            rows={2}
            placeholder="点击「换一批」自动生成，或手动输入。用于列表卡片展示。"
            value={aiSummary}
            onChange={(e) => onAiSummaryChange(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting || (titleRequired && !title.trim())}>
            {submitting && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
