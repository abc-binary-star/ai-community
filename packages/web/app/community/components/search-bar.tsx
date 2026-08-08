'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchBar({ value }: { value?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [input, setInput] = useState(value || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInput(value || '')
  }, [value])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    const q = input.trim()
    if (q) {
      params.set('q', q)
    } else {
      params.delete('q')
    }
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `/community/search?${qs}` : '/community/search')
  }

  const handleClear = () => {
    setInput('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `/community/search?${qs}` : '/community/search')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="搜索帖子、评论、用户…"
        className={cn(
          'h-10 w-full rounded-full border border-input bg-card pl-10 pr-9 text-sm shadow-sm',
          'placeholder:text-muted-foreground/70',
          'transition-all focus:border-primary/50 focus:shadow-[0_0_0_4px_hsl(var(--primary)/0.1)] focus:outline-none',
        )}
      />
      {input && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="清空搜索"
        >
          <X className="size-3.5" />
        </button>
      )}
    </form>
  )
}
