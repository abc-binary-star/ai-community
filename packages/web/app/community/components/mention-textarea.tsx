'use client'

import { useState, useRef, useCallback, type TextareaHTMLAttributes } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { getInitials } from '@/lib/utils'

interface MentionUser {
  id: string
  username: string
  avatar: string | null
}

interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'onKeyDown'> {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

// 匹配光标前未完成的 @提及（@ 后跟字母/数字/下划线/中文，不含空格）
const PARTIAL_MENTION_REGEX = /@([a-zA-Z0-9_\u4e00-\u9fff]*)$/

export function MentionTextarea({ value, onChange, onKeyDown, ...props }: MentionTextareaProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionStartRef = useRef(0)

  const searchUsers = useCallback(async (q: string) => {
    if (q.length === 0) {
      setMentionUsers([])
      return
    }
    try {
      const data = await api.get<{ items: MentionUser[] }>(`/users/search?q=${encodeURIComponent(q)}`)
      setMentionUsers(data.items)
      setMentionIndex(0)
    } catch {
      setMentionUsers([])
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    onChange(val)

    const cursor = e.target.selectionStart
    const beforeCursor = val.slice(0, cursor)
    const match = beforeCursor.match(PARTIAL_MENTION_REGEX)

    if (match) {
      setMentionQuery(match[1])
      mentionStartRef.current = cursor - match[0].length
      searchUsers(match[1])
    } else {
      setMentionQuery(null)
      setMentionUsers([])
    }
  }

  const insertMention = (user: MentionUser) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursor = textarea.selectionStart
    const before = value.slice(0, mentionStartRef.current)
    const after = value.slice(cursor)
    const insert = `@${user.username} `
    const newValue = before + insert + after

    onChange(newValue)
    setMentionQuery(null)
    setMentionUsers([])

    // 恢复焦点和光标位置
    requestAnimationFrame(() => {
      const pos = before.length + insert.length
      textarea.focus()
      textarea.setSelectionRange(pos, pos)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionUsers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionUsers.length) % mentionUsers.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionUsers[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        setMentionUsers([])
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 延迟关闭，允许点击下拉项
          setTimeout(() => {
            setMentionQuery(null)
            setMentionUsers([])
          }, 150)
        }}
        {...props}
      />
      {mentionQuery !== null && mentionUsers.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-popover shadow-md">
          {mentionUsers.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(u)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                i === mentionIndex ? 'bg-accent' : 'hover:bg-accent'
              }`}
            >
              <Avatar className="size-6">
                <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                  {getInitials(u.username)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{u.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
