/** AI 润色错误类型 */
export type AiErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'network'
  | 'structure'
  | 'empty'
  | 'unknown'

export class AiPolishError extends Error {
  readonly kind: AiErrorKind

  constructor(kind: AiErrorKind, message?: string) {
    super(message || defaultAiErrorMessage(kind))
    this.name = 'AiPolishError'
    this.kind = kind
  }
}

export function defaultAiErrorMessage(kind: AiErrorKind): string {
  switch (kind) {
    case 'cancelled':
      return 'AI 润色已取消'
    case 'timeout':
      return 'AI 润色超时，请重试'
    case 'network':
      return '网络错误，请检查连接'
    case 'structure':
      return 'AI 结果结构异常，请重试'
    case 'empty':
      return 'AI 返回为空，请重试'
    default:
      return 'AI 润色失败'
  }
}

/** 判断错误是否为取消（不展示为失败） */
export function isAiCancelled(e: unknown): boolean {
  if (e instanceof AiPolishError) return e.kind === 'cancelled'
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (e instanceof Error && e.message.includes('aborted')) return true
  return false
}

/** 将任意错误转换为 AiPolishError */
export function toAiPolishError(e: unknown): AiPolishError {
  if (e instanceof AiPolishError) return e
  if (isAiCancelled(e)) return new AiPolishError('cancelled')
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('timed out')) return new AiPolishError('timeout', e.message)
    if (msg.includes('network') || msg.includes('failed to fetch') || e instanceof TypeError) {
      return new AiPolishError('network', e.message)
    }
    if (msg.includes('结构') || msg.includes('structure') || msg.includes('不完整')) {
      return new AiPolishError('structure', e.message)
    }
    if (msg.includes('empty') || msg.includes('为空')) {
      return new AiPolishError('empty', e.message)
    }
    return new AiPolishError('unknown', e.message)
  }
  return new AiPolishError('unknown', String(e))
}
