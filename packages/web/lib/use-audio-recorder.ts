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

/**
 * PCM 录音 hook
 * 使用 AudioContext + ScriptProcessorNode 采集原始 PCM 数据（16kHz, 16-bit, mono）
 * 输出 Blob 可直接传给火山引擎 ASR API
 */
export function useAudioRecorder() {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const chunksRef = useRef<Int16Array[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function' &&
        (typeof AudioContext !== 'undefined' || typeof (window as unknown as Record<string, unknown>).webkitAudioContext !== 'undefined')
    )
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setDuration(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      // 创建 AudioContext，指定 16kHz 采样率（兼容 Safari 的 webkit 前缀）
      const AudioContextCtor = AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext
      const audioContext = new AudioContextCtor({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // 如果实际采样率不是 16000，需要后续重采样（但 AudioContext 通常会尊重指定值）
      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source

      // ScriptProcessorNode，bufferSize 4096
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        // Float32 -> Int16 PCM 转换
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        chunksRef.current.push(pcm16)
      }

      // ScriptProcessorNode 必须连接 destination 才能触发 onaudioprocess
      // 但直接连接会播放声音到扬声器，用一个零增益 GainNode 避免回声
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(audioContext.destination)

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
      const ctx = audioContextRef.current
      if (!ctx) {
        cleanup()
        setRecording(false)
        resolve(null)
        return
      }

      // 合并所有 PCM chunks
      const chunks = chunksRef.current
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
      if (totalLength === 0) {
        cleanup()
        setRecording(false)
        resolve(null)
        return
      }

      const merged = new Int16Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }

      // 转为 Blob（Int16Array 的 buffer 就是 raw PCM）
      const blob = new Blob([merged.buffer], { type: 'audio/pcm' })

      cleanup()
      setRecording(false)
      resolve(blob)
    })
  }, [cleanup])

  /** 取消录音，不返回音频 */
  const cancel = useCallback(() => {
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
