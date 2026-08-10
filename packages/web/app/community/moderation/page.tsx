'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Check, ExternalLink, Flag, LifeBuoy, Loader2, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { formatRelativeTime } from '@/lib/utils'
import type { Appeal, Paginated, Report } from 'shared'

const PAGE_SIZE = 20

const STATUS_TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
] as const

const APPEAL_TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'resolved', label: '已接受' },
  { key: 'rejected', label: '已驳回' },
] as const

const REASON_LABELS: Record<string, string> = {
  '垃圾广告': '垃圾广告',
  '侮辱谩骂': '侮辱谩骂',
  '色情低俗': '色情低俗',
  '违法违规': '违法违规',
  '内容不实': '内容不实',
}

export default function ModerationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [tab, setTab] = useState<'reports' | 'appeals'>(searchParams.get('tab') === 'appeals' ? 'appeals' : 'reports')
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [appealStatus, setAppealStatus] = useState<'pending' | 'resolved' | 'rejected'>('pending')
  const [handlingId, setHandlingId] = useState<string | null>(null)
  const [banningId, setBanningId] = useState<string | null>(null)

  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const canModerate = hasHydrated && !!user && (user.role === 'admin' || user.role === 'moderator')

  const reportsQuery = useQuery({
    queryKey: ['reports', status, page],
    queryFn: () => api.get<Paginated<Report>>(`/reports?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: canModerate && tab === 'reports',
  })

  const appealsQuery = useQuery({
    queryKey: ['appeals', appealStatus, page],
    queryFn: () => api.get<Paginated<Appeal>>(`/appeals?status=${appealStatus}&page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: canModerate && tab === 'appeals',
  })

  const goPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`/community/moderation?${params.toString()}`)
  }

  const switchTab = (next: 'reports' | 'appeals') => {
    setTab(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    params.delete('page')
    router.push(`/community/moderation?${params.toString()}`)
  }

  const handleReport = async (report: Report, action: 'approved' | 'rejected') => {
    if (action === 'approved' && !window.confirm('通过后该内容将被删除且无法恢复，确定继续？')) return
    setHandlingId(report.id)
    try {
      await api.put(`/reports/${report.id}`, { status: action })
      toast.success(action === 'approved' ? '已通过，违规内容已删除' : '已拒绝该举报')
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '处理失败')
    } finally {
      setHandlingId(null)
    }
  }

  const handleBanUser = async (report: Report) => {
    if (!window.confirm('封禁后该用户将无法登录和发布内容，确定继续？')) return
    setBanningId(report.id)
    try {
      const username = window.prompt('请输入要封禁的用户名：')
      if (!username) {
        setBanningId(null)
        return
      }
      await api.post(`/users/${encodeURIComponent(username)}/ban`, { action: 'ban' })
      toast.success(`已封禁用户 ${username}`)
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '封禁失败')
    } finally {
      setBanningId(null)
    }
  }

  const handleAppeal = async (appeal: Appeal, action: 'resolved' | 'rejected') => {
    const note = window.prompt(action === 'resolved' ? '处理备注（可选）：' : '驳回原因：')
    if (action === 'rejected' && !note) {
      toast.error('驳回时请填写原因')
      return
    }
    setHandlingId(appeal.id)
    try {
      await api.put(`/appeals/${appeal.id}`, { status: action, note: note ?? '' })
      toast.success(action === 'resolved' ? '已接受申诉，如用户被封禁将自动解封' : '已驳回申诉')
      queryClient.invalidateQueries({ queryKey: ['appeals'] })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '处理失败')
    } finally {
      setHandlingId(null)
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!canModerate) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="text-muted-foreground">仅管理员或版主可访问内容审核</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community/discover">返回社区</Link>
        </Button>
      </div>
    )
  }

  const reports = reportsQuery.data?.items ?? []
  const reportTotalPages = reportsQuery.data?.totalPages ?? 1
  const appeals = appealsQuery.data?.items ?? []
  const appealTotalPages = appealsQuery.data?.totalPages ?? 1

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          内容审核
        </h1>
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() => switchTab('reports')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'reports' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Flag className="mr-1 inline size-3.5" />
            举报
          </button>
          <button
            type="button"
            onClick={() => switchTab('appeals')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'appeals' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LifeBuoy className="mr-1 inline size-3.5" />
            申诉
          </button>
        </div>
      </div>

      {/* 状态 Tab */}
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-muted p-1">
        {(tab === 'reports' ? STATUS_TABS : APPEAL_TABS).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              if (tab === 'reports') setStatus(t.key as typeof status)
              else setAppealStatus(t.key as typeof appealStatus)
              goPage(1)
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              (tab === 'reports' ? status === t.key : appealStatus === t.key)
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 举报列表 */}
      {tab === 'reports' && (
        <>
          {reportsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="animate-spin" />
              加载举报…
            </div>
          ) : reports.length === 0 ? (
            <Card className="border-dashed">
              <div className="p-10 text-center text-sm text-muted-foreground">暂无{STATUS_TABS.find((t) => t.key === status)?.label}的举报</div>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <Card key={report.id}>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        <Flag className="size-3" />
                        {report.targetType === 'post' ? '帖子' : report.targetType === 'comment' ? '评论' : report.targetType === 'annotation' ? '想法' : '回复'}
                      </Badge>
                      <Badge
                        className={
                          report.status === 'pending'
                            ? 'border-transparent bg-amber-500/10 text-amber-600'
                            : report.status === 'approved'
                              ? 'border-transparent bg-destructive/10 text-destructive'
                              : 'border-transparent bg-secondary text-secondary-foreground'
                        }
                      >
                        {STATUS_TABS.find((t) => t.key === report.status)?.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {report.reporter.username} 举报于 {formatRelativeTime(report.createdAt)}
                      </span>
                      {report.targetType === 'post' && report.targetId && (
                        <Link
                          href={`/community/post/${report.targetId}`}
                          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          查看原文
                          <ExternalLink className="size-3" />
                        </Link>
                      )}
                    </div>

                    {report.targetTitle && <p className="font-medium">{report.targetTitle}</p>}
                    {report.targetBody && <p className="line-clamp-3 text-sm text-muted-foreground">{report.targetBody}</p>}
                    {report.targetType === 'comment' && !report.targetBody && (
                      <p className="text-sm text-muted-foreground">（评论已被删除）</p>
                    )}

                    <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 px-3 py-2">
                      <span className="text-xs font-medium text-amber-600">举报原因</span>
                      <span className="text-sm text-foreground/90">{REASON_LABELS[report.reason] || report.reason}</span>
                    </div>

                    {report.handler && (
                      <p className="text-xs text-muted-foreground">
                        由 {report.handler.username} 处理{report.note ? `：${report.note}` : ''}
                      </p>
                    )}

                    {report.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => handleReport(report, 'approved')}
                          disabled={handlingId === report.id}
                        >
                          {handlingId === report.id ? <Loader2 className="size-4 animate-spin" /> : <Check />}
                          通过并删除
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleReport(report, 'rejected')} disabled={handlingId === report.id}>
                          <X />
                          拒绝
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleBanUser(report)}
                          disabled={banningId === report.id}
                        >
                          {banningId === report.id ? <Loader2 className="size-4 animate-spin" /> : <Ban />}
                          封禁用户
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}

              {reportTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => goPage(page - 1)} disabled={page <= 1}>
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {reportTotalPages}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => goPage(page + 1)} disabled={page >= reportTotalPages}>
                    下一页
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 申诉列表 */}
      {tab === 'appeals' && (
        <>
          {appealsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="animate-spin" />
              加载申诉…
            </div>
          ) : appeals.length === 0 ? (
            <Card className="border-dashed">
              <div className="p-10 text-center text-sm text-muted-foreground">暂无{APPEAL_TABS.find((t) => t.key === appealStatus)?.label}的申诉</div>
            </Card>
          ) : (
            <div className="space-y-3">
              {appeals.map((appeal) => (
                <Card key={appeal.id}>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        <LifeBuoy className="size-3" />
                        账号申诉
                      </Badge>
                      <Badge
                        className={
                          appeal.status === 'pending'
                            ? 'border-transparent bg-amber-500/10 text-amber-600'
                            : appeal.status === 'resolved'
                              ? 'border-transparent bg-emerald-500/10 text-emerald-600'
                              : 'border-transparent bg-secondary text-secondary-foreground'
                        }
                      >
                        {APPEAL_TABS.find((t) => t.key === appeal.status)?.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        <Link href={`/u/${appeal.user.username}`} className="hover:underline">
                          @{appeal.user.username}
                        </Link>{' '}
                        申诉于 {formatRelativeTime(appeal.createdAt)}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{appeal.content}</p>

                    {appeal.handler && (
                      <p className="text-xs text-muted-foreground">
                        由 {appeal.handler.username} 处理{appeal.note ? `：${appeal.note}` : ''}
                      </p>
                    )}

                    {appeal.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                          onClick={() => handleAppeal(appeal, 'resolved')}
                          disabled={handlingId === appeal.id}
                        >
                          {handlingId === appeal.id ? <Loader2 className="size-4 animate-spin" /> : <Check />}
                          接受（解封）
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleAppeal(appeal, 'rejected')} disabled={handlingId === appeal.id}>
                          <X />
                          驳回
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}

              {appealTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => goPage(page - 1)} disabled={page <= 1}>
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {appealTotalPages}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => goPage(page + 1)} disabled={page >= appealTotalPages}>
                    下一页
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
