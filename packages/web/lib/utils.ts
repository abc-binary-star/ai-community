import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// 合并 Tailwind 类名，去重冲突
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// 相对时间格式化（中文），不引入额外库
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)

  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} 个月前`
  return `${Math.floor(diff / 31536000)} 年前`
}

// 取用户名首字符（用于头像 fallback）
export function getInitials(name: string): string {
  return (name || '?').trim().slice(0, 2).toUpperCase()
}

// 截断文本
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}
