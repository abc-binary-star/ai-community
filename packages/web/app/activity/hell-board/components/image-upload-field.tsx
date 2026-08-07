'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

const MAX_SIZE = 30 << 20
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/**
 * 选图即上传的图片字段。复用社区已有的 POST /upload/image：
 * 该接口按内容 MD5 去重，同一张图重复上传不会产生多份存储。
 */
export function ImageUploadField({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string
  onChange: (url: string) => void
  label: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePick = async (file: File | undefined) => {
    if (!file) return
    setError(null)

    if (file.size > MAX_SIZE) {
      setError('图片不能超过 30MB')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiFetch<{ url: string }>('/upload/image', {
        method: 'POST',
        body: formData,
      })
      onChange(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请重试')
    } finally {
      setUploading(false)
      // 清空原生 input，保证同一文件可再次触发 change
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handlePick(e.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-2 rounded-md border-2 border-stone-300 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="size-12 shrink-0 rounded border border-stone-200 object-cover" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-stone-500">已上传</span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="shrink-0 rounded border border-stone-300 px-2 py-1 text-[11px] font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            重选
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled || uploading}
            aria-label={`移除${label}`}
            className="shrink-0 rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={cn(
            'flex h-9 w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-stone-300 text-xs font-medium text-stone-500',
            'transition-colors hover:border-stone-800 hover:text-stone-900 disabled:opacity-50',
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              上传中
            </>
          ) : (
            <>
              <ImagePlus className="size-3.5" />
              {label}
            </>
          )}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-1 text-[11px] font-bold text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}
