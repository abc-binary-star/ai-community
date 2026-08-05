'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

export type EnrichResult = {
  titles: string[]
  summary: string
  tags: string[]
}

type EnrichOnly = 'title' | 'summary' | 'tags'

type UseAiEnrichOptions = {
  onTitles: (titles: string[]) => void
  onSummary: (summary: string) => void
  onTags: (tags: string[]) => void
}

/**
 * AI 补全：一次调用生成标题、摘要、标签。
 *
 * 三个产物共用同一份正文摘录，合并为一次请求，省掉两份重复的正文上传
 * 和两次往返。单项重生成（只换标题、只换标签）走 only 参数，
 * 服务端仍复用缓存里的摘录，成本很低。
 */
export function useAiEnrich({ onTitles, onSummary, onTags }: UseAiEnrichOptions) {
  const [enriching, setEnriching] = useState(false)
  const [regenerating, setRegenerating] = useState<EnrichOnly | null>(null)

  const run = useCallback(
    async (title: string, content: string, only?: EnrichOnly) => {
      if (!content || content.trim().length < 10) {
        toast.error('内容至少 10 个字才能使用 AI 补全')
        return
      }

      if (only) setRegenerating(only)
      else setEnriching(true)

      try {
        const data = await api.post<EnrichResult>('/ai/enrich', {
          title: title.trim(),
          content,
          only: only ?? '',
        })

        let applied = 0
        if (data.titles?.length) {
          onTitles(data.titles)
          applied++
        }
        if (data.summary) {
          onSummary(data.summary)
          applied++
        }
        if (data.tags?.length) {
          onTags(data.tags)
          applied++
        }

        if (applied === 0) {
          toast.error('未能生成内容，请手动填写')
          return
        }

        if (only === 'title') toast.success('已重新生成标题')
        else if (only === 'summary') toast.success('已重新生成摘要')
        else if (only === 'tags') toast.success('已重新生成标签')
        else toast.success('AI 已补全标题、摘要和标签')
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'AI 生成失败，请手动填写')
      } finally {
        setEnriching(false)
        setRegenerating(null)
      }
    },
    [onTitles, onSummary, onTags]
  )

  return { enriching, regenerating, run }
}
