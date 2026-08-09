'use client'

import { useRef } from 'react'
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface CoverEditorProps {
  /** 当前封面地址：blob 本地预览或 OSS URL，空字符串表示未设置 */
  coverUrl: string
  /** 封面变化回调：url 为预览地址或 OSS 地址，file 为待上传的本地文件 */
  onChange: (coverUrl: string, coverFile: File | null) => void
}

/**
 * 帖子封面编辑器：固定 16:9 比例预览，紧凑布局不挤占编辑器空间。
 * 选择图片后先本地预览，发布/保存时由父组件统一上传 OSS。
 */
export function CoverEditor({ coverUrl, onChange }: CoverEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片文件太大，最多 5MB')
      return
    }
    // 先本地预览，发布/保存时统一上传
    if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl)
    onChange(URL.createObjectURL(file), file)
  }

  const handleRemove = () => {
    if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl)
    onChange('', null)
  }

  return (
    <div className="flex items-end gap-3">
      {coverUrl ? (
        <div className="group relative w-40 shrink-0 overflow-hidden rounded-lg border bg-muted shadow-sm sm:w-48">
          <img src={coverUrl} alt="封面预览" className="aspect-video w-full object-cover" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-video w-40 shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary sm:w-48"
        >
          <ImagePlus className="size-5" />
          <span className="text-xs">添加封面</span>
        </button>
      )}
      <div className="flex flex-col gap-1.5 pb-0.5">
        {coverUrl ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              <RefreshCw className="size-3.5" />
              更换
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={handleRemove}
            >
              <Trash2 className="size-3.5" />
              移除
            </Button>
          </>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground/80">
            推荐 16:9 比例
            <br />
            建议 1920×1080
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
