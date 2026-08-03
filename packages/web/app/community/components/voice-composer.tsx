'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, Loader2, Mic, MicOff, Pencil, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'
import { useSpeechRecognition } from '@/lib/use-speech-recognition'
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
  const { supported, listening, finalTranscript, interimTranscript, error, start, stop, reset } =
    useSpeechRecognition({ lang: 'zh-CN' })

  // 编辑模式：用户可手动修改转录文本
  const [editing, setEditing] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [polished, setPolished] = useState<string | null>(null)
  const [style, setStyle] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 录音停止后自动进入编辑模式
  const fullText = finalTranscript + interimTranscript
  const displayText = editing ? editedText : fullText

  const handleToggleListen = () => {
    if (listening) {
      stop()
      if (finalTranscript) {
        setEditedText(finalTranscript)
        setEditing(true)
      }
    } else {
      reset()
      setPolished(null)
      start()
    }
  }

  const handlePolish = async () => {
    const text = editing ? editedText : finalTranscript
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
    const text = polished || (editing ? editedText : finalTranscript)
    if (text.trim()) {
      onInsert(text.trim())
      onClose()
    }
  }

  const handleEditToggle = () => {
    if (!editing) {
      setEditedText(fullText)
      setEditing(true)
    } else {
      // 退出编辑模式，同步回 finalTranscript 逻辑：保持 editedText 作为最终文本
      setEditing(false)
    }
  }

  const hasContent = (editing ? editedText : finalTranscript).trim().length > 0

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 底部弹出面板 */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl animate-in slide-in-from-bottom duration-200"
      >
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
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 主体 */}
          <div className="space-y-4 px-5 py-4">
            {!supported && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-600">
                当前浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器。
              </div>
            )}

            {error && (
              <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <p className="font-medium">语音识别出错</p>
                <p className="text-xs leading-5">{error}</p>
              </div>
            )}

            {/* 录音状态指示 */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleToggleListen}
                disabled={!supported}
                className={cn(
                  'flex size-16 items-center justify-center rounded-full transition-all',
                  listening
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
                    : 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90',
                  !supported && 'cursor-not-allowed opacity-50'
                )}
                aria-label={listening ? '停止录音' : '开始录音'}
              >
                {listening ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {listening ? '正在录音…点击停止' : hasContent ? '可继续录音或润色后插入' : '点击麦克风开始说话'}
            </p>

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
                        onClick={handleEditToggle}
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
                    {finalTranscript}
                    {interimTranscript && (
                      <span className="text-muted-foreground">{interimTranscript}</span>
                    )}
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
                        'rounded-full px-3 py-1 text-xs transition-colors',
                        style === s.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
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
            {hasContent && !polished && (
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
