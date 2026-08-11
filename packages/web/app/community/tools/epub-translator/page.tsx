'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  Gauge,
  Languages,
  Loader2,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ---------- 类型 ----------

type TaskStatus = 'PENDING' | 'QUEUED' | 'PARSING' | 'READY' | 'TRANSLATING' | 'ASSEMBLING' | 'COMPLETED' | 'FAILED'

interface TaskItem {
  task_id: string
  status: TaskStatus
  file_name?: string
  book_title?: string
  source_lang?: string
  target_lang?: string
  progress: number
  total_chunks: number
  translated_chunks: number
  error?: string
  glossary_set: boolean
  accepted: boolean
  created_at: string
}

interface Chapter {
  index: number
  id: string
  title: string
  kind?: string
  status: 'PENDING' | 'TRANSLATING' | 'TRANSLATED' | 'REVIEWED'
}

interface GlossaryTerm {
  source: string
  target: string
  type?: string
  confidence?: number
}

interface ConsistencyIssue {
  term: string
  variants: string
  count?: number
  suggestion?: string
  confidence?: string
}

interface QAReport {
  overall?: number
  scores?: { dimension: string; score: number; comment?: string }[]
  samples?: number
  issues?: string[]
}

const LANGS = [
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'es', label: '西班牙语' },
]

const STATUS_META: Record<TaskStatus, { label: string; tone: 'default' | 'active' | 'done' | 'error' }> = {
  PENDING: { label: '等待中', tone: 'default' },
  QUEUED: { label: '排队中', tone: 'default' },
  PARSING: { label: '解析中', tone: 'active' },
  READY: { label: '已就绪', tone: 'done' },
  TRANSLATING: { label: '翻译中', tone: 'active' },
  ASSEMBLING: { label: '组装中', tone: 'active' },
  COMPLETED: { label: '已完成', tone: 'done' },
  FAILED: { label: '失败', tone: 'error' },
}

const KIND_META: Record<string, { label: string; cls: string }> = {
  cover: { label: '封面', cls: 'bg-primary/10 text-primary' },
  'title-page': { label: '扉页', cls: 'bg-sky-500/10 text-sky-600' },
  'copyright-page': { label: '版权', cls: 'bg-violet-500/10 text-violet-600' },
  toc: { label: '目录', cls: 'bg-amber-500/10 text-amber-600' },
}

const CH_STATUS_META: Record<Chapter['status'], { label: string; tone: 'secondary' | 'default' | 'info' }> = {
  PENDING: { label: '未翻译', tone: 'secondary' },
  TRANSLATING: { label: '翻译中', tone: 'info' },
  TRANSLATED: { label: '已翻译', tone: 'default' },
  REVIEWED: { label: '已审核', tone: 'default' },
}

const DIM_LABELS: Record<string, string> = {
  faithfulness: '忠实度',
  fluency: '流畅度',
  terminology: '术语一致性',
  format: '格式保持',
}

// ---------- API ----------

const API = {
  translate: '/et-api/translate',
  tasks: '/et-api/tasks',
  chapters: (id: string) => `/et-api/tasks/${id}/chapters`,
  chapterContent: (id: string, i: number) => `/et-api/tasks/${id}/chapters/${i}/content`,
  chapterTranslate: (id: string, i: number) => `/et-api/tasks/${id}/chapters/${i}/translate`,
  frontMatter: (id: string) => `/et-api/tasks/${id}/frontmatter/translate`,
  translateAll: (id: string) => `/et-api/tasks/${id}/translate`,
  exportBook: (id: string) => `/et-api/tasks/${id}/export`,
  glossary: (id: string) => `/et-api/tasks/${id}/glossary`,
  glossaryExtract: (id: string) => `/et-api/tasks/${id}/glossary/extract`,
  consistency: (id: string) => `/et-api/tasks/${id}/consistency`,
  qa: (id: string) => `/et-api/tasks/${id}/qa`,
  accept: (id: string) => `/et-api/tasks/${id}/accept`,
  download: (id: string) => `/et-api/tasks/${id}/download`,
}

async function postJSON(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `请求失败 (${res.status})`)
  return data
}

function fmtTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------- 主页面 ----------

export default function EPUBTranslatorPage() {
  // 上传
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [sourceLang, setSourceLang] = useState('en')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 工作台
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [frontDone, setFrontDone] = useState(false)
  const [busy, setBusy] = useState('') // 当前忙碌操作标识

  // 预览
  const [preview, setPreview] = useState<{ index: number; title: string; kind?: string; source: string; translated: string } | null>(null)

  // 术语表 / 报告（保留既有能力）
  const [glossaryTask, setGlossaryTask] = useState<TaskItem | null>(null)
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([])
  const [glossaryBusy, setGlossaryBusy] = useState(false)
  const [report, setReport] = useState<{ title: string; sub: string; body: React.ReactNode } | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(API.tasks)
      const data = await res.json()
      setTasks(data.tasks ?? [])
    } catch { /* 忽略 */ }
  }, [])

  const fetchChapters = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(API.chapters(taskId))
      const data = await res.json()
      if (!res.ok) return
      setChapters(data.chapters ?? [])
      setFrontDone(data.front_matter_done ?? false)
    } catch { /* 忽略 */ }
  }, [])

  useEffect(() => {
    fetchTasks()
    const timer = setInterval(fetchTasks, 2500)
    return () => clearInterval(timer)
  }, [fetchTasks])

  // 工作台轮询章节状态
  useEffect(() => {
    if (!activeTask) return
    fetchChapters(activeTask.task_id)
    const timer = setInterval(() => fetchChapters(activeTask.task_id), 2500)
    return () => clearInterval(timer)
  }, [activeTask, fetchChapters])

  const handleUpload = async () => {
    if (!file || uploading) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('source_lang', sourceLang)
      const res = await fetch(API.translate, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '上传失败')
      toast.success('书籍已上传，正在解析…')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      // 等待解析完成后进入工作台
      const taskId: string = data.task_id
      setTimeout(() => {
        const poll = setInterval(async () => {
          const r = await fetch(API.tasks)
          const list = (await r.json()).tasks ?? []
          const t = list.find((x: TaskItem) => x.task_id === taskId)
          if (t && (t.status === 'READY' || t.status === 'FAILED')) {
            clearInterval(poll)
            setActiveTask(t)
          }
        }, 2000)
      }, 2000)
      fetchTasks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const runFrontMatter = async () => {
    if (!activeTask) return
    setBusy('front')
    try {
      await postJSON(API.frontMatter(activeTask.task_id))
      toast.success('前置页汉化已启动')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy('')
    }
  }

  const runTranslateAll = async () => {
    if (!activeTask) return
    setBusy('all')
    try {
      await postJSON(API.translateAll(activeTask.task_id))
      toast.success('整本翻译已启动')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy('')
    }
  }

  const translateChapter = async (ch: Chapter) => {
    if (!activeTask) return
    try {
      await postJSON(API.chapterTranslate(activeTask.task_id, ch.index))
      toast.success(`第 ${ch.index + 1} 章翻译已启动`)
      fetchChapters(activeTask.task_id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const previewChapter = async (ch: Chapter) => {
    if (!activeTask) return
    try {
      const res = await fetch(API.chapterContent(activeTask.task_id, ch.index))
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '读取失败')
      setPreview({
        index: data.index,
        title: data.title,
        kind: data.kind,
        source: data.source_html ?? '',
        translated: data.translated_html ?? '',
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '读取失败')
    }
  }

  const exportBook = async () => {
    if (!activeTask) return
    setBusy('export')
    try {
      const data = await postJSON(API.exportBook(activeTask.task_id))
      toast.success('导出完成', { description: '已生成简体中文 EPUB' })
      window.open(API.download(activeTask.task_id), '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    } finally {
      setBusy('')
    }
  }

  const translatedCount = chapters.filter((c) => c.status === 'TRANSLATED' || c.status === 'REVIEWED').length

  // ---------- 术语表（保留） ----------

  const openGlossary = async (task: TaskItem) => {
    setGlossaryTask(task)
    setGlossaryTerms([])
    try {
      const res = await fetch(API.glossary(task.task_id))
      const data = await res.json()
      if (data.glossary_draft) setGlossaryTerms(JSON.parse(data.glossary_draft))
      else if (data.glossary_set && data.glossary) setGlossaryTerms(JSON.parse(data.glossary))
    } catch { /* 忽略 */ }
  }

  const extractGlossary = async () => {
    if (!glossaryTask) return
    setGlossaryBusy(true)
    try {
      const data = await postJSON(API.glossaryExtract(glossaryTask.task_id))
      const terms = JSON.parse(data.glossary_draft ?? '[]')
      setGlossaryTerms(terms)
      toast.success(`AI 抽取完成：${terms.length} 条候选术语`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '抽取失败')
    } finally {
      setGlossaryBusy(false)
    }
  }

  const updateTerm = (i: number, field: 'source' | 'target', value: string) => {
    setGlossaryTerms((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }

  const removeTerm = (i: number) => setGlossaryTerms((prev) => prev.filter((_, idx) => idx !== i))

  const saveGlossary = async () => {
    if (!glossaryTask) return
    const valid = glossaryTerms.filter((t) => t.source.trim() && t.target.trim())
    if (!valid.length) {
      toast.error('术语表为空，请至少保留一条')
      return
    }
    try {
      const data = await postJSON(API.glossary(glossaryTask.task_id), { glossary: JSON.stringify(valid) })
      toast.success(`术语表已保存：${data.count} 条`)
      setGlossaryTask(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  // ---------- 一致性 / QA / 验收（保留） ----------

  const runConsistency = async () => {
    if (!activeTask) return
    toast.loading('正在检查一致性…')
    try {
      const data = await postJSON(API.consistency(activeTask.task_id))
      const issues = JSON.parse(data.consistency_report ?? '[]') as ConsistencyIssue[]
      toast.dismiss()
      if (!issues.length) {
        setReport({ title: '一致性检查', sub: '术语与译名一致性良好', body: <p className="text-sm text-muted-foreground">未发现不一致问题。</p> })
        return
      }
      setReport({
        title: '一致性检查',
        sub: `发现 ${issues.length} 处疑似不一致`,
        body: (
          <ul className="space-y-2">
            {issues.map((it, i) => (
              <li key={i} className="rounded-lg border-l-2 border-amber-500 bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{it.term}</span>
                <span className="text-amber-600"> · {it.variants}</span>
                <span className="text-muted-foreground"> · 出现 {it.count ?? '-'} 次 · {it.confidence ?? 'low'}</span>
                <p className="mt-1 text-muted-foreground">建议统一为：{it.suggestion || '-'}</p>
              </li>
            ))}
          </ul>
        ),
      })
    } catch (err) {
      toast.dismiss()
      toast.error(err instanceof Error ? err.message : '校验失败')
    }
  }

  const runQA = async () => {
    if (!activeTask) return
    toast.loading('正在质量评估…')
    try {
      const data = await postJSON(API.qa(activeTask.task_id))
      const reportData = JSON.parse(data.qa_report ?? '{}') as QAReport
      toast.dismiss()
      const scoreTone = (s: number) => (s >= 4 ? 'text-emerald-600' : s >= 3 ? 'text-amber-600' : 'text-red-600')
      setReport({
        title: 'QA 质量评估',
        sub: `抽样 ${reportData.samples ?? 0} 段 · 综合评分 ${reportData.overall ?? '-'}/5`,
        body: (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(reportData.scores ?? []).map((s, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{DIM_LABELS[s.dimension] || s.dimension}</p>
                  <p className={cn('mt-1 text-xl font-bold', scoreTone(s.score))}>{s.score}/5</p>
                  {s.comment && <p className="mt-1 text-xs text-muted-foreground">{s.comment}</p>}
                </div>
              ))}
            </div>
            {!!reportData.issues?.length && (
              <div>
                <h4 className="mb-1.5 text-sm font-medium">待改进项</h4>
                <ul className="space-y-1.5">
                  {reportData.issues.map((issue, i) => (
                    <li key={i} className="rounded-lg border-l-2 border-amber-500 bg-muted/40 px-3 py-2 text-sm">{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ),
      })
    } catch (err) {
      toast.dismiss()
      toast.error(err instanceof Error ? err.message : '评估失败')
    }
  }

  // ---------- 渲染 ----------

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      {/* 标题栏 */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">EPUB 翻译</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传外文 EPUB，查看目录 → 汉化前置页 → 逐章翻译 → 审核导出
        </p>
      </div>

      {/* 上传区（无任务或返回列表时展示） */}
      {!activeTask && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileUp className="size-4 text-primary" />
              上传书籍
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files?.[0] ?? null) }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              <BookOpenText className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">{file ? file.name : '点击选择或拖拽 EPUB 文件到此处'}</p>
              <p className="text-xs text-muted-foreground">{file ? `${(file.size / 1024).toFixed(1)} KB` : '支持 .epub 格式'}</p>
              <input ref={fileInputRef} type="file" accept=".epub" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="src-lang">源语言</Label>
                <select id="src-lang" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
                  {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <Label>目标语言</Label>
                <Input value="简体中文" readOnly />
              </div>
              <Button onClick={handleUpload} disabled={!file || uploading} className="sm:w-32">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {uploading ? '上传中…' : '上传解析'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 任务列表（未选中任务时） */}
      {!activeTask && (
        <div className="mt-6 space-y-3">
          {tasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无书籍，上传一本 EPUB 开始吧</p>
          )}
          {tasks.map((task) => {
            const meta = STATUS_META[task.status] ?? STATUS_META.PENDING
            const running = task.status === 'PARSING' || task.status === 'TRANSLATING' || task.status === 'ASSEMBLING' || task.status === 'QUEUED'
            return (
              <Card key={task.task_id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{task.book_title || task.file_name || '未命名书籍'}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.source_lang?.toUpperCase()} → {task.target_lang?.toUpperCase()} · {fmtTime(task.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.accepted && (
                        <Badge variant="default" className="bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/15">
                          <CheckCircle2 className="mr-1 size-3" />已验收
                        </Badge>
                      )}
                      <Badge variant={meta.tone === 'done' ? 'default' : meta.tone === 'error' ? 'warning' : 'secondary'}>
                        {running && <Loader2 className="mr-1 size-3 animate-spin" />}
                        {meta.label}
                      </Badge>
                    </div>
                  </div>
                  {task.error && <p className="text-xs text-destructive">{task.error}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setActiveTask(task)} disabled={running}>
                      <BookOpenText className="mr-1 size-3.5" />
                      打开工作台
                    </Button>
                    {task.status === 'COMPLETED' && (
                      <Button asChild variant="outline" size="sm">
                        <a href={API.download(task.task_id)} target="_blank" rel="noreferrer">
                          <Download className="mr-1 size-3.5" />下载
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* 书籍工作台 */}
      {activeTask && (
        <div className="space-y-4">
          {/* 顶栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setActiveTask(null)} aria-label="返回列表">
                <ArrowLeft className="size-4" />
              </Button>
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold tracking-tight">{activeTask.book_title || activeTask.file_name}</h2>
                <p className="text-xs text-muted-foreground">
                  共 {chapters.length} 章 · 已翻译 {translatedCount} 章
                  {frontDone && ' · 前置页已汉化'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={runFrontMatter} disabled={frontDone || busy === 'front'}>
                {busy === 'front' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Languages className="mr-1 size-3.5" />}
                {frontDone ? '前置页已汉化' : '汉化前置页'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => openGlossary(activeTask)}>
                <BookOpenText className="mr-1 size-3.5" />
                术语表{activeTask.glossary_set ? '✓' : ''}
              </Button>
              <Button variant="outline" size="sm" onClick={runConsistency} disabled={translatedCount === 0}>
                <ShieldCheck className="mr-1 size-3.5" />
                一致性
              </Button>
              <Button variant="outline" size="sm" onClick={runQA} disabled={translatedCount === 0}>
                <Gauge className="mr-1 size-3.5" />
                QA 评估
              </Button>
              <Button variant="outline" size="sm" onClick={runTranslateAll} disabled={busy === 'all' || chapters.every((c) => c.status !== 'PENDING')}>
                {busy === 'all' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <PackageOpen className="mr-1 size-3.5" />}
                整本翻译
              </Button>
              <Button asChild size="sm">
                <a href={`/et-reader/${activeTask.task_id}`} target="_blank" rel="noreferrer">
                  <BookOpenText className="mr-1 size-3.5" />
                  沉浸式阅读
                </a>
              </Button>
              <Button size="sm" onClick={exportBook} disabled={translatedCount === 0 || busy === 'export'}>
                {busy === 'export' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Download className="mr-1 size-3.5" />}
                导出
              </Button>
            </div>
          </div>

          {/* 章节列表 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpenText className="size-4 text-primary" />
                目录
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {chapters.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">章节加载中…</p>
              )}
              {chapters.map((ch) => {
                const kind = KIND_META[ch.kind ?? '']
                const st = CH_STATUS_META[ch.status] ?? CH_STATUS_META.PENDING
                return (
                  <div key={ch.index} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
                    <span className="w-7 shrink-0 text-right font-mono text-xs text-muted-foreground">{ch.index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {kind && <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', kind.cls)}>{kind.label}</span>}
                        <span className="truncate text-sm font-medium">{ch.title || `章节 ${ch.index + 1}`}</span>
                      </span>
                    </span>
                    <Badge variant={st.tone}>
                      {ch.status === 'TRANSLATING' && <Loader2 className="mr-1 size-3 animate-spin" />}
                      {st.label}
                    </Badge>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => previewChapter(ch)}>
                        <Eye className="mr-1 size-3.5" />预览
                      </Button>
                      {ch.status === 'PENDING' && (
                        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => translateChapter(ch)}>
                          <Sparkles className="mr-1 size-3.5" />翻译本章
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 预览弹窗 */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setPreview(null)} />
          <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <h3 className="font-display font-semibold">{preview.title || `章节 ${preview.index + 1}`}</h3>
                <p className="text-xs text-muted-foreground">
                  {KIND_META[preview.kind ?? '']?.label ?? '正文'} · {preview.translated ? '已翻译' : '未翻译'}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setPreview(null)} aria-label="关闭">
                <XCircle className="size-4" />
              </Button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
              {preview.translated ? (
                <div className="prose-sm max-w-none space-y-4">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">译文</p>
                    <div className="rounded-lg border border-border/60 p-3 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: preview.translated }} />
                  </div>
                  <details className="rounded-lg bg-muted/40 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">查看原文</summary>
                    <div className="mt-2 text-sm leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: preview.source }} />
                  </details>
                </div>
              ) : (
                <div className="rounded-lg border p-3 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: preview.source }} />
              )}
            </div>
            <div className="flex justify-end border-t px-5 py-3">
              <Button variant="outline" onClick={() => setPreview(null)}>知道了</Button>
            </div>
          </div>
        </div>
      )}

      {/* 术语表弹窗 */}
      {glossaryTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setGlossaryTask(null)} />
          <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <h3 className="font-display font-semibold">术语表确认</h3>
                <p className="text-xs text-muted-foreground">核对 AI 抽取的译名后保存，翻译将严格遵循</p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setGlossaryTask(null)} aria-label="关闭">
                <XCircle className="size-4" />
              </Button>
            </div>
            <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-5 py-4">
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={extractGlossary} disabled={glossaryBusy}>
                  {glossaryBusy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Sparkles className="mr-1 size-3.5" />}
                  AI 抽取候选
                </Button>
                <span className="text-xs text-muted-foreground">{glossaryTerms.length ? `候选 ${glossaryTerms.length} 条` : '未抽取'}</span>
              </div>
              {glossaryTerms.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无术语数据，点击「AI 抽取候选」从书中提取专有名词</p>
              ) : (
                glossaryTerms.map((term, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input value={term.source} onChange={(e) => updateTerm(i, 'source', e.target.value)} placeholder="原文" />
                    <Input value={term.target} onChange={(e) => updateTerm(i, 'target', e.target.value)} placeholder="译名" />
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{term.type || 'term'}</span>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => removeTerm(i)} aria-label="删除">
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="ghost" onClick={() => setGlossaryTask(null)}>取消</Button>
              <Button onClick={saveGlossary}>保存术语表</Button>
            </div>
          </div>
        </div>
      )}

      {/* 报告弹窗 */}
      {report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setReport(null)} />
          <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <h3 className="font-display font-semibold">{report.title}</h3>
                <p className="text-xs text-muted-foreground">{report.sub}</p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setReport(null)} aria-label="关闭">
                <XCircle className="size-4" />
              </Button>
            </div>
            <div className="scrollbar-thin max-h-[55vh] overflow-y-auto px-5 py-4">{report.body}</div>
            <div className="flex justify-end border-t px-5 py-3">
              <Button variant="outline" onClick={() => setReport(null)}>知道了</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
