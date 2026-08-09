'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, Mic, Pencil, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api, apiFetch, ApiError } from '@/lib/api'
import { useAudioRecorder } from '@/lib/use-audio-recorder'
import { toast } from 'sonner'

export type VoiceTarget = 'comment' | 'paragraph'

export interface VoiceComposerProps {
  /** 润色目标：评论精简模式还是段落展开模式 */
  target: VoiceTarget
  /** 确认插入时的回调，传入最终文本 */
  onInsert: (text: string) => void
  /** 关闭浮层 */
  onClose: () => void
}

export function VoiceComposer({ target, onInsert, onClose }: VoiceComposerProps) {
  const { supported, recording, duration, error, start, stop, cancel } = useAudioRecorder()

  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [editing, setEditing] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [polished, setPolished] = useState<string | null>(null)
  const [style, setStyle] = useState('')

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (recording) cancel()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [recording, cancel, onClose])

  const handleToggleRecord = async () => {
    if (recording) {
      const blob = await stop()
      if (blob && blob.size > 0) {
        await transcribe(blob)
      }
    } else {
      setTranscript('')
      setPolished(null)
      setEditing(false)
      start()
    }
  }

  const transcribe = async (blob: Blob) => {
    setTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('file', blob, 'audio.pcm')

      const data = await apiFetch<{ text: string }>('/ai/transcribe', {
        method: 'POST',
        body: formData,
      })
      setTranscript(data.text)
      setEditedText(data.text)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '语音识别失败')
    } finally {
      setTranscribing(false)
    }
  }

  const handlePolish = async () => {
    const text = editing ? editedText : transcript
    if (!text.trim()) {
      toast.error('没有可润色的内容')
      return
    }
    setPolishing(true)
    try {
      const data = await api.post<{ result: string }>('/ai/voice-polish', {
        content: text,
        style,
        target,
      })
      setPolished(data.result)
      toast.success('润色完成')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI 润色失败')
    } finally {
      setPolishing(false)
    }
  }

  const handleConfirm = () => {
    const text = polished || (editing ? editedText : transcript)
    if (text.trim()) {
      onInsert(text.trim())
      onClose()
    }
  }

  const hasContent = (editing ? editedText : transcript).trim().length > 0
  const isBusy = recording || transcribing || polishing
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (recording) cancel()
          onClose()
        }}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl animate-in slide-in-from-bottom duration-200">
        <div className="rounded-t-2xl border border-b-0 border-border bg-card shadow-2xl">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Mic className="size-4 text-primary" />
              <span className="text-sm font-medium">
                语音输入 · {target === 'comment' ? '评论' : '段落'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (recording) cancel()
                onClose()
              }}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 主体 */}
          <div className="space-y-4 px-5 py-4">
            {!supported && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-600">
                <p className="font-medium">无法使用语音输入</p>
                <p className="mt-1 text-xs leading-5">
                  录音功能需要 HTTPS 安全上下文。请通过 HTTPS 访问本站，或使用 localhost 地址。
                </p>
              </div>
            )}

            {error && (
              <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <p className="font-medium">录音出错</p>
                <p className="text-xs leading-5">{error}</p>
              </div>
            )}

            {/* 录音状态指示 */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleToggleRecord}
                disabled={!supported || transcribing}
                className={cn(
                  'flex size-16 items-center justify-center rounded-full border transition-colors',
                  recording
                    ? 'border-red-500 text-red-500 animate-pulse'
                    : 'border-primary/60 text-primary hover:border-primary hover:bg-primary/[0.06]',
                  (!supported || transcribing) && 'cursor-not-allowed opacity-50'
                )}
                aria-label={recording ? '停止录音' : '开始录音'}
              >
                {transcribing ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : recording ? (
                  <Square className="size-5 fill-current" />
                ) : (
                  <Mic className="size-6" />
                )}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                {transcribing
                  ? '正在识别语音…'
                  : recording
                    ? `正在录音… ${timeStr}`
                    : hasContent
                      ? '可继续录音或润色后插入'
                      : '点击麦克风开始说话'}
              </p>
            </div>

            {/* 转录文本区 */}
            {hasContent && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {polished ? '润色结果' : '转录文本'}
                  </span>
                  <div className="flex items-center gap-1">
                    {!polished && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!editing) {
                            setEditedText(transcript)
                            setEditing(true)
                          } else {
                            setEditing(false)
                          }
                        }}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent',
                          editing ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        <Pencil className="size-3" />
                        {editing ? '编辑中' : '编辑'}
                      </button>
                    )}
                  </div>
                </div>

                {polished ? (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-primary/20 bg-primary/[0.03] p-3 text-sm leading-6">
                    {polished}
                  </div>
                ) : editing ? (
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="max-h-48 min-h-[80px] resize-y text-sm leading-6"
                    placeholder="转录文本…"
                  />
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6">
                    {transcript}
                  </div>
                )}
              </div>
            )}

            {/* 风格选择 + 润色按钮 */}
            {hasContent && !polished && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {[
                    { key: '', label: '自然' },
                    { key: 'formal', label: '正式' },
                    { key: 'casual', label: '口语' },
                    { key: 'friendly', label: '亲和' },
                  ].map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStyle(s.key)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        style === s.key
                          ? 'border-primary/60 text-primary'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto gap-1.5"
                  disabled={polishing}
                  onClick={handlePolish}
                >
                  {polishing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  AI 润色
                </Button>
              </div>
            )}

            {/* 润色后操作 */}
            {polished && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setPolished(null)}
                >
                  返回编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="ml-auto gap-1.5"
                  onClick={handleConfirm}
                >
                  <Check className="size-3.5" />
                  插入{target === 'comment' ? '评论' : '段落'}
                </Button>
              </div>
            )}

            {/* 无润色直接插入 */}
            {hasContent && !polished && !isBusy && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleConfirm}
              >
                直接插入原文
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
