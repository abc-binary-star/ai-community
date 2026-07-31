import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// 小号衬线标签：像杂志栏目名，去圆角填色，改为细边框 + 字距
const badgeVariants = cva(
  'inline-flex items-center border border-border px-2 py-0.5 font-sans text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/30 text-primary',
        secondary: 'border-border text-secondary-foreground',
        outline: 'border-border text-foreground',
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
