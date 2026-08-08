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
        // 主按钮：珊瑚实色平面，hover 仅降一档明度
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // 描边按钮：卡片底 + 中性描边，hover 填浅底
        outline: 'border border-input bg-card hover:bg-accent hover:text-accent-foreground',
        // 次要按钮：浅中性块
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // 幽灵按钮：透明，hover 浅底
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
