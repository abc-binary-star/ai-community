'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/lib/store'
import { useCreateAsset } from '@/lib/use-assets'
import { ApiError } from '@/lib/api'
import type { AssetInputVariable } from 'shared'
import { toast } from 'sonner'

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

  // 未登录跳转
  if (hasHydrated && !user) {
    if (typeof window !== 'undefined') {
      router.replace('/login?redirect=%2Fcommunity%2Fassets%2Fnew')
    }
    return null
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
