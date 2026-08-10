// 简单的润色调用工具：对富文本的选区或全文执行 API 调用，返回 markdown 结果（AiDiffPanel 消费）
import { api, apiFetchStream, ApiError } from '@/lib/api'
import { protectMarkdownForRewrite } from '@/lib/content-projection'

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

  if (selection) {
    const data = await api.post<{ result: string }>('/ai/rewrite', {
      content,
      selection,
      style,
    })
    return data.result
  }

  const protectedRewrite = protectMarkdownForRewrite(content)
  const response = await apiFetchStream('/ai/rewrite-stream', {
    method: 'POST',
    body: JSON.stringify({ content: protectedRewrite.markdown, style }),
    signal,
  })
  if (!response.body) throw new Error('流式响应不可用')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''
  let received = 0
  let total = 0
  let completed = false
  const consume = (text: string) => {
    buffer += text
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const event of events) {
      const line = event.split('\n').find((item) => item.startsWith('data: '))
      if (!line) continue
      const data = JSON.parse(line.slice(6)) as {
        result?: string
        error?: string
        total?: number
        done?: boolean
      }
      if (data.error) throw new ApiError(data.error, 400, '')
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
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    consume(decoder.decode(chunk.value, { stream: true }))
  }
  consume(decoder.decode())
  if (!completed || !result || (total > 0 && received !== total)) {
    throw new Error('AI 润色结果不完整，请重试')
  }
  return protectedRewrite.restore(result)
}
