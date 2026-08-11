'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/lib/store'
import { useCreateAsset } from '@/lib/use-assets'
import { ApiError } from '@/lib/api'
import type { AssetInputVariable } from 'shared'
import { toast } from 'sonner'

// 预定义标签（与服务端 assetPredefinedTags 保持一致）
const PREDEFINED_TAGS = [
  '写作', '文案', '摘要', '续写',
  '翻译', '本地化',
  '分析', '解读', '总结',
  '角色扮演', '对话', '问答',
  '格式化', '转换', '提取',
]

const TAG_MAX = 5
const TAG_MAX_LEN = 10

export default function NewAssetPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const createMutation = useCreateAsset()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [promptTemplate, setPromptTemplate] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public')
  // 简化版输入变量编辑：JSON 文本框，前端解析
  const [varsJson, setVarsJson] = useState('[]')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // 未登录跳转
  if (hasHydrated && !user) {
    if (typeof window !== 'undefined') {
      router.replace('/login?redirect=%2Fcommunity%2Fassets%2Fnew')
    }
    return null
  }

  const addTag = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    if (tags.length >= TAG_MAX) {
      toast.error(`最多选择 ${TAG_MAX} 个标签`)
      return
    }
    if (tags.includes(t)) return
    if (Array.from(t).length > TAG_MAX_LEN) {
      toast.error(`标签不能超过 ${TAG_MAX_LEN} 个字`)
      return
    }
    setTags([...tags, t])
    setTagInput('')
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !promptTemplate.trim()) {
      toast.error('名称和模板必填')
      return
    }
    let inputVariables: AssetInputVariable[] = []
    if (varsJson.trim()) {
      try {
        inputVariables = JSON.parse(varsJson)
        if (!Array.isArray(inputVariables)) throw new Error('not array')
      } catch {
        toast.error('输入变量 JSON 格式错误')
        return
      }
    }
    try {
      const asset = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        promptTemplate,
        inputVariables,
        tags,
        status: 'draft',
        visibility,
      })
      toast.success('已创建草稿，可继续编辑后发布')
      router.push(`/community/assets/${asset.id}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '创建失败')
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/community/assets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">新建 AI 资产</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">名称 *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：每日新闻摘要"
            maxLength={150}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">描述</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话说明这个资产能做什么"
            rows={2}
            maxLength={1000}
          />
        </div>

        {/* 标签（C1） */}
        <div className="space-y-2">
          <Label>标签（最多 {TAG_MAX} 个）</Label>
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  <Tag className="h-3 w-3" />
                  {t}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              ))}
            </div>
          )}
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => addTag(tagInput)}
            placeholder="输入标签后回车添加"
            className="h-8 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {PREDEFINED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addTag(t)}
                className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prompt">Prompt 模板 *</Label>
          <Textarea
            id="prompt"
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            placeholder={'请为以下主题写一段简介：\n\n主题：{{topic}}\n风格：{{style}}'}
            rows={8}
          />
          <p className="text-xs text-muted-foreground">
            用 {'{{变量名}}'} 声明占位符，试玩时会替换为用户输入
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vars">输入变量声明（JSON）</Label>
          <Textarea
            id="vars"
            value={varsJson}
            onChange={(e) => setVarsJson(e.target.value)}
            placeholder={'[\n  {"name":"topic","type":"string","required":true,"label":"主题"},\n  {"name":"style","type":"select","options":["正式","口语"],"required":true,"label":"风格"}\n]'}
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            type 可选：string / number / boolean / select；select 需提供 options
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visibility">可见范围</Label>
          <select
            id="visibility"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted' | 'private')}
          >
            <option value="public">公开（进入列表）</option>
            <option value="unlisted">不列入列表（直链可访问）</option>
            <option value="private">仅作者</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            创建草稿
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/community/assets">取消</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          创建后默认为草稿状态，可在详情页修改后点「发布」上线
        </p>
      </form>
    </div>
  )
}
