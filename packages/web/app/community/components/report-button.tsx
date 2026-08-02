'use client'

import { useRouter } from 'next/navigation'
import { Flag } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

// 常见举报原因
const REPORT_REASONS = ['垃圾广告', '侮辱谩骂', '色情低俗', '违法违规', '内容不实']

// 举报按钮：下拉选择原因即提交（菜单选择后自动收起）
export function ReportButton({ targetType, targetId }: { targetType: 'post' | 'comment'; targetId: string }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)

  const handleReport = async (reason: string) => {
    if (!token) {
      router.push('/login')
      return
    }
    try {
      await api.post('/reports', { targetType, targetId, reason })
      toast.success('举报已提交，感谢反馈')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '举报失败')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Flag className="size-3.5" />
          举报
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">举报原因</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {REPORT_REASONS.map((reason) => (
          <DropdownMenuItem key={reason} onClick={() => handleReport(reason)}>
            {reason}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
