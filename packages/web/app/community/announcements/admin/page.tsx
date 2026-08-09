'use client'

import { useEffect, useState } from 'react'
import {
  Archive,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
  ANNOUNCEMENT_LEVEL_LABELS,
  ANNOUNCEMENT_STATUS_LABELS,
  fromDateTimeLocal,
  toDateTimeLocal,
} from '@/lib/announcements-meta'
import { announcementsKey, useAnnouncement, useAnnouncements } from '@/lib/use-announcements'
import { cn } from '@/lib/utils'
import type { Announcement, AnnouncementCategory, AnnouncementLevel, AnnouncementStatus, PenaltyItem } from 'shared'

const STATUS_TABS: AnnouncementStatus[] = ['draft', 'published', 'offline']

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface FormState {
  title: string
  content: string
  category: AnnouncementCategory
  level: AnnouncementLevel
  isPinned: boolean
  publishAt: string
  expireAt: string
  penaltyList: PenaltyItem[]
}

function emptyForm(): FormState {
  return {
    title: '',
    content: '',
    category: 'feature',
    level: 'normal',
    isPinned: false,
    publishAt: '',
    expireAt: '',
    penaltyList: [],
  }
}

function AnnouncementForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Announcement | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          title: initial.title,
          content: initial.content,
          category: initial.category,
          level: initial.level,
          isPinned: initial.isPinned,
          publishAt: toDateTimeLocal(initial.publishAt),
          expireAt: toDateTimeLocal(initial.expireAt),
          penaltyList: initial.penaltyList ?? [],
        }
      : emptyForm(),
  )
  const [saving, setSaving] = useState<'draft' | 'published' | 'update' | null>(null)

  useEffect(() => {
    if (initial) {
      setForm({
        title: initial.title,
        content: initial.content,
        category: initial.category,
        level: initial.level,
        isPinned: initial.isPinned,
        publishAt: toDateTimeLocal(initial.publishAt),
        expireAt: toDateTimeLocal(initial.expireAt),
        penaltyList: initial.penaltyList ?? [],
      })
    }
  }, [initial])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setPenalty = (index: number, key: keyof PenaltyItem, value: string) => {
    setForm((prev) => ({
      ...prev,
      penaltyList: prev.penaltyList.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }))
  }

  const save = async (action: 'draft' | 'published' | 'update') => {
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) {
      toast.error('标题和正文不能为空')
      return
    }
    if (form.expireAt && form.publishAt && new Date(form.expireAt) <= new Date(form.publishAt)) {
      toast.error('过期时间必须晚于生效时间')
      return
    }
    if (!initial && form.publishAt && new Date(form.publishAt) < new Date()) {
      toast.error('生效时间不能早于当前时间')
      return
    }
    if (action === 'published' && form.level === 'urgent') {
      const confirmed = window.confirm(
        '紧急公告会显示为不可关闭横幅，且同一时间只允许一条生效。确定继续发布？',
      )
      if (!confirmed) return
    }

    setSaving(action)
    const payload = {
      title,
      content,
      level: form.level,
      isPinned: form.isPinned,
      publishAt: fromDateTimeLocal(form.publishAt) ?? '',
      expireAt: fromDateTimeLocal(form.expireAt) ?? '',
      penaltyList: form.penaltyList.filter((row) => row.username.trim()),
    }
    try {
      if (initial) {
        await api.put(`/announcements/${initial.id}`, payload)
        toast.success('公告已保存')
      } else {
        await api.post('/announcements', { ...payload, category: form.category, status: action })
        toast.success(action === 'draft' ? '草稿已保存' : '公告已发布')
      }
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '保存失败')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="size-5 text-primary" />
            {initial ? '编辑公告' : '新建公告'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭表单">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ann-title">标题</Label>
          <Input
            id="ann-title"
            value={form.title}
            maxLength={100}
            onChange={(e) => set('title', e.target.value)}
            placeholder="公告标题，1-100 字"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ann-content">正文（Markdown）</Label>
          <Textarea
            id="ann-content"
            value={form.content}
            rows={10}
            maxLength={20000}
            onChange={(e) => set('content', e.target.value)}
            placeholder="支持 Markdown 与 @提及"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ann-category">分类</Label>
            <select
              id="ann-category"
              className={cn(selectClass, 'disabled:cursor-not-allowed disabled:opacity-50')}
              value={form.category}
              disabled={!!initial}
              onChange={(e) => set('category', e.target.value as AnnouncementCategory)}
            >
              {ANNOUNCEMENT_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {ANNOUNCEMENT_CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
            {initial && <p className="text-xs text-muted-foreground">已发布公告的分类不可修改</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-level">分级</Label>
            <select
              id="ann-level"
              className={selectClass}
              value={form.level}
              onChange={(e) => set('level', e.target.value as AnnouncementLevel)}
            >
              {(['normal', 'important', 'urgent'] as AnnouncementLevel[]).map((key) => (
                <option key={key} value={key}>
                  {ANNOUNCEMENT_LEVEL_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ann-publish">生效时间</Label>
            <Input
              id="ann-publish"
              type="datetime-local"
              value={form.publishAt}
              onChange={(e) => set('publishAt', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-expire">过期时间（留空长期有效）</Label>
            <Input
              id="ann-expire"
              type="datetime-local"
              value={form.expireAt}
              onChange={(e) => set('expireAt', e.target.value)}
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPinned}
            onChange={(e) => set('isPinned', e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          置顶公告
        </label>

        {form.category === 'moderation' && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <Label>处置公示名单</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set('penaltyList', [...form.penaltyList, { username: '', reason: '', action: '', date: '' }])
                }
              >
                <Plus />
                添加
              </Button>
            </div>
            {form.penaltyList.length === 0 && (
              <p className="text-sm text-muted-foreground">未添加名单；发布后展示时账号会做脱敏处理</p>
            )}
            <div className="space-y-2">
              {form.penaltyList.map((row, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <Input
                    placeholder="用户名"
                    value={row.username}
                    onChange={(e) => setPenalty(index, 'username', e.target.value)}
                  />
                  <Input
                    placeholder="原因"
                    value={row.reason}
                    onChange={(e) => setPenalty(index, 'reason', e.target.value)}
                  />
                  <Input
                    placeholder="处理"
                    value={row.action}
                    onChange={(e) => setPenalty(index, 'action', e.target.value)}
                  />
                  <Input
                    placeholder="时间"
                    value={row.date ?? ''}
                    onChange={(e) => setPenalty(index, 'date', e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 text-muted-foreground hover:text-destructive"
                    aria-label="移除名单"
                    onClick={() => set('penaltyList', form.penaltyList.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {!initial ? (
            <>
              <Button
                variant="outline"
                onClick={() => save('draft')}
                disabled={saving !== null}
              >
                {saving === 'draft' ? <Loader2 className="size-4 animate-spin" /> : null}
                存草稿
              </Button>
              <Button onClick={() => save('published')} disabled={saving !== null}>
                {saving === 'published' ? <Loader2 className="size-4 animate-spin" /> : <Send />}
                发布
              </Button>
            </>
          ) : (
            <Button onClick={() => save('update')} disabled={saving !== null}>
              {saving === 'update' ? <Loader2 className="size-4 animate-spin" /> : null}
              保存修改
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function AnnouncementsAdminPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [status, setStatus] = useState<AnnouncementStatus>('draft')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const listQuery = useAnnouncements('', 1, status)
  const editQuery = useAnnouncement(editingId ?? '')
  const canManage = hasHydrated && !!user && user.role === 'admin'

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: announcementsKey })
    queryClient.invalidateQueries({ queryKey: ['announcement-unread-count'] })
  }

  const changeStatus = async (id: string, next: AnnouncementStatus) => {
    try {
      await api.put(`/announcements/${id}/status`, { status: next })
      toast.success(next === 'published' ? '公告已发布' : '公告已下线')
      invalidate()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '操作失败')
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('确定删除这条公告吗？此操作不可撤销。')) return
    try {
      await api.del(`/announcements/${id}`)
      toast.success('公告已删除')
      invalidate()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="text-muted-foreground">仅管理员可管理官方公告</p>
        <Button asChild variant="outline" className="mt-4">
          <a href="/community/discover">返回社区</a>
        </Button>
      </div>
    )
  }

  const items = listQuery.data?.items ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Megaphone className="size-5 text-primary" />
          公告管理
        </h1>
        <Button size="sm" onClick={() => { setEditingId(null); setFormOpen(true) }}>
          <Plus />
          新建公告
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-full bg-muted p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatus(tab)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              status === tab ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {ANNOUNCEMENT_STATUS_LABELS[tab]}
          </button>
        ))}
      </div>

      {formOpen && (
        editingId ? (
          editQuery.isLoading ? (
            <Card>
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载公告…
              </div>
            </Card>
          ) : editQuery.isError || !editQuery.data ? (
            <Card className="border-dashed">
              <div className="p-12 text-center text-sm text-muted-foreground">公告加载失败</div>
            </Card>
          ) : (
            <AnnouncementForm
              initial={editQuery.data}
              onClose={() => { setFormOpen(false); setEditingId(null) }}
              onSaved={() => { setFormOpen(false); setEditingId(null); invalidate() }}
            />
          )
        ) : (
          <AnnouncementForm
            initial={null}
            onClose={() => setFormOpen(false)}
            onSaved={() => { setFormOpen(false); invalidate() }}
          />
        )
      )}

      {listQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载公告…
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <div className="p-12 text-center text-sm text-muted-foreground">
            暂无{ANNOUNCEMENT_STATUS_LABELS[status]}的公告
          </div>
        </Card>
      ) : (
          <>
        <Card className="hidden sm:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">标题</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">分级</th>
                  <th className="px-4 py-3 font-medium">生效时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.title}</span>
                        {item.isPinned && <Badge variant="secondary">置顶</Badge>}
                        {item.edited && <span className="shrink-0 text-xs text-muted-foreground">已编辑</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{ANNOUNCEMENT_CATEGORY_LABELS[item.category]}</td>
                    <td className="px-4 py-3">{ANNOUNCEMENT_LEVEL_LABELS[item.level]}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(item.publishAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => { setEditingId(item.id); setFormOpen(true) }}
                        >
                          <Pencil />
                          编辑
                        </Button>
                        {item.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-primary"
                            onClick={() => changeStatus(item.id, 'published')}
                          >
                            <Send />
                            发布
                          </Button>
                        )}
                        {item.status === 'published' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-amber-600"
                            onClick={() => changeStatus(item.id, 'offline')}
                          >
                            <Archive />
                            下线
                          </Button>
                        )}
                        {item.status === 'offline' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-primary"
                            onClick={() => changeStatus(item.id, 'published')}
                          >
                            <RotateCcw />
                            重新发布
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => remove(item.id)}
                        >
                          <Trash2 />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 移动端：卡片式列表 */}
        <div className="space-y-3 sm:hidden">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                {item.isPinned && <Badge variant="secondary">置顶</Badge>}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{ANNOUNCEMENT_CATEGORY_LABELS[item.category]}</span>
                <span>{ANNOUNCEMENT_LEVEL_LABELS[item.level]}</span>
                <span>
                  {new Date(item.publishAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {item.edited && <span>已编辑</span>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border/60 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => { setEditingId(item.id); setFormOpen(true) }}
                >
                  <Pencil />
                  编辑
                </Button>
                {item.status === 'draft' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-primary"
                    onClick={() => changeStatus(item.id, 'published')}
                  >
                    <Send />
                    发布
                  </Button>
                )}
                {item.status === 'published' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-amber-600"
                    onClick={() => changeStatus(item.id, 'offline')}
                  >
                    <Archive />
                    下线
                  </Button>
                )}
                {item.status === 'offline' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-primary"
                    onClick={() => changeStatus(item.id, 'published')}
                  >
                    <RotateCcw />
                    重新发布
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(item.id)}
                >
                  <Trash2 />
                  删除
                </Button>
              </div>
            </Card>
          ))}
         </div>
          </>
       )}
     </div>
  )
}
