import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// 精致按钮系统（参考 Vercel Geist + 2025 趋势）
// - primary: 蓝色 + 同色系微渐变 + 顶部高光 + hover 阴影下沉 + active 按下
// - secondary: 半透明主色（替代描边，2025 趋势）
// - outline: 描边 + hover 填充
// - ghost: 纯透明 hover 浅底
// - 全部加 active:scale 按下反馈 + 双层 focus ring
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // 主按钮：同色系微渐变（sky-500→sky-600）+ 顶部内高光 + 悬停阴影下沉
        default:
          'bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-[0_1px_2px_rgba(2,132,199,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-primary hover:to-primary/80 hover:shadow-[0_4px_12px_-2px_rgba(2,132,199,0.4),inset_0_1px_0_rgba(255,255,255,0.25)]',
        destructive:
          'bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground shadow-[0_1px_2px_rgba(220,38,38,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_4px_12px_-2px_rgba(220,38,38,0.4)]',
        // 描边按钮：浅底 + 描边，hover 填充浅蓝
        outline:
          'border border-input bg-card shadow-sm hover:border-primary/40 hover:bg-accent hover:text-accent-foreground',
        // 次要按钮：半透明主色（2025 趋势，替代描边）
        secondary:
          'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
        // 幽灵按钮：纯透明，hover 浅蓝底
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
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
