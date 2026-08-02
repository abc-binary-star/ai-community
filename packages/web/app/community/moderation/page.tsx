'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Flag, Loader2, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import { formatRelativeTime } from '@/lib/utils'
import type { Paginated, Report } from 'shared'

const PAGE_SIZE = 20

const STATUS_TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
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
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const hydrated = useHydrated()
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [handlingId, setHandlingId] = useState<string | null>(null)

  const canModerate = hydrated && !!user && (user.role === 'admin' || user.role === 'moderator')

  const reportsQuery = useQuery({
    queryKey: ['reports', status],
    queryFn: () => api.get<Paginated<Report>>(`/reports?status=${status}&page=1&pageSize=${PAGE_SIZE}`),
    enabled: canModerate,
  })

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

  if (!hydrated) {
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
          <Link href="/community">返回社区</Link>
        </Button>
      </div>
    )
  }

  const reports = reportsQuery.data?.items ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          内容审核
        </h1>
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                status === tab.key ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

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
                    {report.targetType === 'post' ? '帖子' : '评论'}
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
                  <div className="flex gap-2">
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
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
