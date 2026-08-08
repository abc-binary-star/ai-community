import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// 标签系统（Marginalia 主题）
// 语义化变体：浅底深字的软胶囊，替代此前散落的硬编码蓝色版主标识。
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-success/12 text-success',
        warning: 'border-transparent bg-warning/12 text-warning',
        info: 'border-transparent bg-info/12 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
