'use client'

import { Toaster as Sonner } from 'sonner'
import type { ComponentProps } from 'react'

type ToasterProps = ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      toastOptions={{
        classNames: {
          // 纸色底、细边框、无阴影、衬线描述
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-sm group-[.toaster]:font-sans',
          description: 'group-[.toast]:font-serif group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
