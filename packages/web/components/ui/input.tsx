import * as React from 'react'
import { cn } from '@/lib/utils'

// 下划线式输入：底部一条线，focus 加粗变绿（杂志表单感）
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn('input-underline h-11 w-full text-[15px] placeholder:text-muted-foreground/70', className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
