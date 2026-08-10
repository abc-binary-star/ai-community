import { CheckCircle2, Loader2, AlertCircle, CloudOff } from 'lucide-react'
import type { SaveStatus } from '@/lib/draft-storage'
import { formatSaveTime } from '@/lib/draft-storage'
import { cn } from '@/lib/utils'

export interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSavedAt?: number | null
  errorMessage?: string
  dirty?: boolean
  className?: string
}

const STATUS_CONFIG: Record<SaveStatus, { icon: typeof CheckCircle2; label: string; tone: string }> = {
  idle: { icon: CloudOff, label: '未保存', tone: 'text-muted-foreground' },
  saving: { icon: Loader2, label: '保存中…', tone: 'text-muted-foreground' },
  saved: { icon: CheckCircle2, label: '已保存', tone: 'text-emerald-600 dark:text-emerald-400' },
  error: { icon: AlertCircle, label: '保存失败', tone: 'text-destructive' },
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
  dirty,
  className,
}: SaveStatusIndicatorProps) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  const showTime = status === 'saved' && lastSavedAt
  const dirtySuffix = (dirty && status === 'saved') ? ' · 有未保存更改' : ''
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        cfg.tone,
        dirty && status === 'saved' && 'text-muted-foreground',
        className,
      )}
      title={errorMessage || (dirty ? '内容有本地改动，尚未写入本地草稿' : undefined)}
    >
      <Icon className={cn('size-3.5', status === 'saving' && 'animate-spin')} />
      <span className="truncate">
        {(dirty && status === 'saved') ? '本地改动未保存' : cfg.label}
        {showTime && !dirty ? ` · ${formatSaveTime(lastSavedAt)}` : ''}
        {dirtySuffix}
      </span>
    </div>
  )
}
