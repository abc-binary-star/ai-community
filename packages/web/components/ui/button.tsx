import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// 精致按钮系统（Fresh Editorial 主题）
// - primary: 珊瑚橙渐变 + 顶部高光 + hover 提升 + active 按下
// - secondary: 暖米色半透明主色
// - outline: 暖色描边 + hover 填充
// - ghost: 纯透明 hover 浅杏底
// - 全部加 active:scale 按下反馈 + 双层 focus ring
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // 主按钮：珊瑚橙渐变 + 顶部内高光 + 悬停提升与暖影
        default:
          'bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-[0_1px_2px_rgba(230,90,40,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:-translate-y-px hover:from-primary hover:to-primary/75 hover:shadow-[0_6px_16px_-4px_rgba(230,90,40,0.45),inset_0_1px_0_rgba(255,255,255,0.3)]',
        destructive:
          'bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground shadow-[0_1px_2px_rgba(220,38,38,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_6px_16px_-4px_rgba(220,38,38,0.4)]',
        // 描边按钮：暖纸底 + 描边，hover 填充杏色
        outline:
          'border border-input bg-card shadow-sm hover:border-primary/40 hover:bg-accent hover:text-accent-foreground',
        // 次要按钮：暖米色半透明主色
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70 hover:text-primary',
        // 幽灵按钮：纯透明，hover 浅杏底
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-[13px]',
        lg: 'h-11 rounded-xl px-6 text-[15px]',
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
