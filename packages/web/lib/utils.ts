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

// 编辑时间格式化：今天显示 HH:mm，昨天显示"昨天"，更早显示"X 天前"
export function formatEditedTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round((todayStart.getTime() - targetStart.getTime()) / 86400000)
  if (dayDiff === 0) {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  if (dayDiff === 1) return '昨天'
  return `${dayDiff} 天前`
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

// 去除 Markdown 标记，返回纯文本（用于列表摘要）
export function stripMarkdown(md: string): string {
  return md
    // 代码块 ```...```
    .replace(/```[\s\S]*?```/g, '')
    // 行内代码 `code`
    .replace(/`([^`]+)`/g, '$1')
    // 图片 ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 链接 [text](url)
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 标题标记 #
    .replace(/^#{1,6}\s+/gm, '')
    // 粗体/斜体 **text** / *text* / __text__ / _text_
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // 删除线 ~~text~~
    .replace(/~~([^~]+)~~/g, '$1')
    // 引用 > text
    .replace(/^>\s+/gm, '')
    // 列表标记 - / * / 1.
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // 水平分割线
    .replace(/^[-*_]{3,}$/gm, '')
    // 表格分隔行
    .replace(/^\|.*\|$/gm, '')
    // 多余的空行和空白
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// 去除 Markdown 标记后截断
export function truncateMarkdown(md: string, max: number): string {
  return truncate(stripMarkdown(md), max)
}

// 提取正文里第一句有分量的话，用作引文卡的主视觉。
// 策略：去 Markdown → 按中英文句末标点切句 → 取第一句长度足够的，
// 太短（如"哈哈"）会继续找下一句；都太短则退回截断的开头。
export function pullQuote(md: string, opts?: { min?: number; max?: number }): string {
  const min = opts?.min ?? 12
  const max = opts?.max ?? 90
  const plain = stripMarkdown(md).replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  const sentences = plain.split(/(?<=[。！？!?…]|\.\s)/).map((s) => s.trim()).filter(Boolean)
  for (const s of sentences) {
    if (s.length >= min) return truncate(s, max)
  }
  return truncate(plain, max)
}
