'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface AudioRecorderState {
  /** 浏览器是否支持录音 */
  supported: boolean
  /** 是否正在录音 */
  recording: boolean
  /** 录音时长（秒） */
  duration: number
  /** 错误信息 */
  error: string | null
}

export function useAudioRecorder() {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function' &&
        typeof MediaRecorder !== 'undefined'
    )
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setDuration(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 选择浏览器支持的音频格式
      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg']
      const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.start()
      setRecording(true)

      // 计时器
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch (e) {
      const err = e as DOMException
      if (err.name === 'NotAllowedError') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风')
      } else if (err.name === 'NotFoundError') {
        setError('未找到麦克风设备')
      } else {
        setError(err.message || '无法启动录音')
      }
    }
  }, [])

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        cleanup()
        setRecording(false)
        resolve(null)
        return
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        cleanup()
        setRecording(false)
        resolve(blob)
      }

      recorder.stop()
    })
  }, [cleanup])

  /** 取消录音，不返回音频 */
  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    cleanup()
    setRecording(false)
    setDuration(0)
    chunksRef.current = []
  }, [cleanup])

  // 组件卸载时清理
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return {
    supported,
    recording,
    duration,
    error,
    start,
    stop,
    cancel,
  }
}
