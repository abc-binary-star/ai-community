'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, FileWarning, Loader2, Megaphone, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { useAuthStore } from '@/lib/store'
import { useHydrated } from '@/lib/use-hydrated'
import {
  ANNOUNCEMENT_CATEGORY_LABELS,
  ANNOUNCEMENT_LEVEL_LABELS,
  maskUsername,
} from '@/lib/announcements-meta'
import { useAnnouncement, useMarkAnnouncementRead } from '@/lib/use-announcements'

export default function AnnouncementDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  const query = useAnnouncement(params.id)
  const markRead = useMarkAnnouncementRead()

  useEffect(() => {
    if (hydrated && token && query.data && !query.data.isRead) {
      markRead.mutate(query.data.id)
    }
  }, [hydrated, token, query.data, markRead])

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        加载公告…
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <FileWarning className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="text-muted-foreground">公告不存在或已下线</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community/announcements">返回公告中心</Link>
        </Button>
      </div>
    )
  }

  const item = query.data
  const publishedAt = new Date(item.publishAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft />
        返回
      </Button>

      <Card>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ANNOUNCEMENT_CATEGORY_LABELS[item.category]}</Badge>
            <Badge
              className={
                item.level === 'urgent'
                  ? 'border-transparent bg-destructive/10 text-destructive'
                  : item.level === 'important'
                    ? 'border-transparent bg-amber-500/10 text-amber-600'
                    : undefined
              }
            >
              {ANNOUNCEMENT_LEVEL_LABELS[item.level]}
            </Badge>
            {item.edited && <span className="text-xs text-muted-foreground">已编辑</span>}
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold leading-snug">
            <Megaphone className="size-6 shrink-0 text-primary" />
            {item.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" />
              {publishedAt}
            </span>
            <span>发布者：{item.author.username}</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <MarkdownRenderer content={item.content} enableBlocks={false} />
        </div>
      </Card>

      {item.category === 'moderation' && item.penaltyList.length > 0 && (
        <Card>
          <div className="space-y-4 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-5 text-destructive" />
              公示名单
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted text-left">
                    <th className="border border-border px-3 py-2 font-medium">账号</th>
                    <th className="border border-border px-3 py-2 font-medium">原因</th>
                    <th className="border border-border px-3 py-2 font-medium">处理</th>
                    {item.penaltyList.some((p) => p.date) && (
                      <th className="border border-border px-3 py-2 font-medium">时间</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {item.penaltyList.map((p, index) => (
                    <tr key={`${p.username}-${index}`}>
                      <td className="border border-border px-3 py-2">{maskUsername(p.username)}</td>
                      <td className="border border-border px-3 py-2">{p.reason || '-'}</td>
                      <td className="border border-border px-3 py-2">{p.action || '-'}</td>
                      {item.penaltyList.some((x) => x.date) && (
                        <td className="border border-border px-3 py-2">{p.date || '-'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              如对处置有异议，可通过社区公约页面的申诉渠道提交复核。
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
