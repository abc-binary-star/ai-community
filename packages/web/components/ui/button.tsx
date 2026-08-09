import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// 平面按钮系统（Marginalia 主题）
// 去渐变、去内高光、去 hover 位移：靠纯色块、边框与明度变化表达层级，
// 更接近现代产品（Linear / Vercel）的克制质感，而非旧论坛的立体拟物。
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // 主按钮：线条式——细主色描边 + 主色文字，hover 仅极淡染底。拒绝深色实心块。
        default:
          'border border-primary/60 text-primary hover:border-primary hover:bg-primary/[0.06]',
        destructive:
          'border border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/[0.06]',
        // 描边按钮：中性细边，hover 极淡染
        outline: 'border border-border text-foreground hover:border-foreground/30 hover:bg-muted/60',
        // 次要按钮：中性细边 + 次级文字
        secondary: 'border border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
        // 幽灵按钮：无边，hover 极淡底
        ghost: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-[13px]',
        lg: 'h-11 rounded-lg px-6 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
