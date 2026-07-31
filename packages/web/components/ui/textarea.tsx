import * as React from 'react'
import { cn } from '@/lib/utils'

// 多行输入：底部下划线 + 极浅纸色底，衬线字体增强书写感
const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'min-h-[120px] w-full rounded-sm border border-border bg-surface px-3 py-2.5 font-serif text-[15px] leading-7',
          'placeholder:text-muted-foreground/60 transition-colors',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
