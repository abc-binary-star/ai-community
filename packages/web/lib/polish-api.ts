// 简单的润色调用工具：对富文本的选区或全文执行 API 调用，返回 markdown 结果（AiDiffPanel 消费）
import { apiFetch, apiFetchStream } from '@/lib/api'
import { protectMarkdownForRewrite } from '@/lib/content-projection'
import { AiPolishError, isAiCancelled, toAiPolishError } from './ai-error'

export interface PolishProgress {
  done: number
  total: number
}

export interface PolishOptions {
  content: string
  selection?: string | null
  style: string
  onProgress?: (p: PolishProgress) => void
  /** 需要流式全文润色才会用到 */
  signal?: AbortSignal
}

export async function polishContent(opts: PolishOptions): Promise<string> {
  const { content, selection, style, onProgress, signal } = opts

  try {
    if (selection) {
      const data = await apiFetch<{ result: string }>('/ai/rewrite', {
        method: 'POST',
        body: JSON.stringify({ content, selection, style }),
        signal,
      })
      if (!data.result || !data.result.trim()) {
        throw new AiPolishError('empty')
      }
      return data.result
    }

    return await polishContentStream(content, style, onProgress, signal)
  } catch (e) {
    if (isAiCancelled(e)) throw e
    throw toAiPolishError(e)
  }
}

async function polishContentStream(
  content: string,
  style: string,
  onProgress: ((p: PolishProgress) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  const protectedRewrite = protectMarkdownForRewrite(content)
  let response: Response
  try {
    response = await apiFetchStream('/ai/rewrite-stream', {
      method: 'POST',
      body: JSON.stringify({ content: protectedRewrite.markdown, style }),
      signal,
    })
  } catch (e) {
    if (isAiCancelled(e)) throw e
    throw new AiPolishError('network', e instanceof Error ? e.message : '网络请求失败')
  }

  if (!response.body) throw new AiPolishError('network', '流式响应不可用')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''
  let received = 0
  let total = 0
  let completed = false
  let readerClosed = false

  const consume = (text: string) => {
    buffer += text
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const event of events) {
      const line = event.split('\n').find((item) => item.startsWith('data: '))
      if (!line) continue
      let data: { result?: string; error?: string; total?: number; done?: boolean }
      try {
        data = JSON.parse(line.slice(6))
      } catch {
        throw new AiPolishError('structure', 'AI 响应解析失败')
      }
      if (data.error) throw new AiPolishError('unknown', data.error)
      if (data.done) {
        completed = true
        continue
      }
      if (!data.result) continue
      result += `${received > 0 ? '\n\n' : ''}${data.result}`
      received += 1
      total = data.total ?? total
      onProgress?.({ done: received, total: total || received })
    }
  }

  try {
    while (true) {
      if (signal?.aborted) {
        throw new AiPolishError('cancelled')
      }
      const chunk = await reader.read()
      if (chunk.done) break
      consume(decoder.decode(chunk.value, { stream: true }))
    }
    consume(decoder.decode())
  } catch (e) {
    if (isAiCancelled(e)) throw e
    if (e instanceof AiPolishError) throw e
    throw new AiPolishError('network', e instanceof Error ? e.message : '流式读取失败')
  } finally {
    if (!readerClosed) {
      readerClosed = true
      try {
        reader.releaseLock()
      } catch {
        // reader 已释放或取消，忽略
      }
    }
  }

  // 16. 流式响应完整性检测
  if (!completed) {
    throw new AiPolishError('structure', 'AI 润色结果不完整（未收到完成信号）')
  }
  if (!result || !result.trim()) {
    throw new AiPolishError('empty')
  }
  if (total > 0 && received !== total) {
    throw new AiPolishError('structure', `AI 润色结果不完整（${received}/${total}）`)
  }

  return protectedRewrite.restore(result)
}
