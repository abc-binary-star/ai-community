import type { AnnouncementCategory, AnnouncementLevel, AnnouncementStatus } from 'shared'

export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = [
  'moderation',
  'rule',
  'feature',
  'maintenance',
  'activity',
]

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  moderation: '处置公示',
  rule: '规则调整',
  feature: '功能更新',
  maintenance: '系统维护',
  activity: '活动通知',
}

export const ANNOUNCEMENT_LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  urgent: '紧急',
  important: '重要',
  normal: '普通',
}

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: '草稿',
  published: '已发布',
  offline: '已下线',
}

// 脱敏：保留首尾字符，中间用星号替代
export function maskUsername(name: string): string {
  if (!name) return '***'
  if (name.length <= 2) return `${name[0]}***`
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name[name.length - 1]}`
}

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
