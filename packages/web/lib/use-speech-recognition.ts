'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API 类型声明
interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (
    (w.SpeechRecognition as SpeechRecognitionConstructor) ??
    (w.webkitSpeechRecognition as SpeechRecognitionConstructor) ??
    null
  )
}

export interface SpeechRecognitionOptions {
  lang?: string
}

export interface SpeechRecognitionState {
  /** 浏览器是否支持语音识别 */
  supported: boolean
  /** 是否正在录音 */
  listening: boolean
  /** 已确认的转录文本（累积） */
  finalTranscript: string
  /** 当前正在识别的临时文本（未确认） */
  interimTranscript: string
  /** 错误信息 */
  error: string | null
}

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  const { lang = 'zh-CN' } = options
  const SR = useRef<SpeechRecognitionConstructor | null>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const shouldListenRef = useRef(false) // 用户是否意图录音中（用于自动续接判断）

  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [finalTranscript, setFinalTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 初始化：检测浏览器支持
  useEffect(() => {
    const ctor = getSpeechRecognition()
    SR.current = ctor
    setSupported(!!ctor)
  }, [])

  // 创建 recognition 实例
  const createRecognition = useCallback(() => {
    const ctor = SR.current
    if (!ctor) return null

    const rec = new ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }
      if (final) {
        setFinalTranscript((prev) => prev + final)
      }
      setInterimTranscript(interim)
    }

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // no-speech 是正常超时，不当作错误
      if (event.error === 'no-speech' || event.error === 'aborted') return

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        // 麦克风权限被拒绝：可能是非安全上下文（非 HTTPS / 非 localhost）或用户拒绝授权
        const isSecure = typeof window !== 'undefined' &&
          (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        setError(isSecure
          ? '麦克风权限被拒绝，请在浏览器地址栏点击锁形图标，允许麦克风权限后重试'
          : '语音识别需要 HTTPS 或 localhost 访问，当前页面非安全上下文')
        // 权限被拒后停止自动续接
        shouldListenRef.current = false
        setListening(false)
      } else {
        setError(event.error || '识别错误')
      }
    }

    rec.onend = () => {
      setInterimTranscript('')
      // 如果用户仍在录音中（未主动停止），自动重启（绕过浏览器超时限制）
      if (shouldListenRef.current) {
        try {
          rec.start()
        } catch {
          // start() 在 already started 状态下会抛异常，忽略
        }
      } else {
        setListening(false)
      }
    }

    return rec
  }, [lang])

  const start = useCallback(() => {
    if (!SR.current) {
      setError('浏览器不支持语音识别')
      return
    }
    setError(null)
    shouldListenRef.current = true

    // 复用已有实例或创建新实例
    if (!recognition.current) {
      recognition.current = createRecognition()
    }
    const rec = recognition.current
    if (!rec) return

    try {
      rec.start()
      setListening(true)
    } catch {
      // already started，忽略
    }
  }, [createRecognition])

  const stop = useCallback(() => {
    shouldListenRef.current = false
    const rec = recognition.current
    if (rec) {
      try {
        rec.stop()
      } catch {
        // 忽略
      }
    }
    setListening(false)
    setInterimTranscript('')
  }, [])

  /** 清空已累积的转录文本 */
  const reset = useCallback(() => {
    setFinalTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      if (recognition.current) {
        try {
          recognition.current.abort()
        } catch {
          // 忽略
        }
        recognition.current = null
      }
    }
  }, [])

  return {
    supported,
    listening,
    finalTranscript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  }
}
