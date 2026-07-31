'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import type { AuthResponse } from 'shared'

const schema = z.object({
  username: z.string().min(2, '用户名至少 2 个字符').max(20, '用户名最多 20 个字符'),
  email: z.string().email('请输入有效的邮箱'),
  password: z.string().min(6, '密码至少 6 位').max(64, '密码最多 64 位'),
})
type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [showPwd, setShowPwd] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    try {
      const data = await api.post<AuthResponse>('/auth/register', values)
      setAuth(data.token, data.user)
      toast.success('注册成功，已自动登录')
      router.push('/community')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '注册失败，请重试')
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-muted-foreground">§ 注册</p>
        <h1 className="font-display text-4xl leading-tight">成为读者。</h1>
        <p className="font-serif text-sm italic text-muted-foreground">开启你的兴趣之旅</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="username" className="font-sans text-xs uppercase tracking-wider text-muted-foreground">
            用户名
          </Label>
          <Input id="username" placeholder="2-20 个字符" {...register('username')} />
          {errors.username && <p className="font-serif text-xs text-destructive">{errors.username.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="font-sans text-xs uppercase tracking-wider text-muted-foreground">
            邮箱
          </Label>
          <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
          {errors.email && <p className="font-serif text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="font-sans text-xs uppercase tracking-wider text-muted-foreground">
            密码
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPwd ? 'text' : 'password'}
              placeholder="至少 6 位"
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPwd ? '隐藏密码' : '显示密码'}
            >
              {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="font-serif text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          注册
        </Button>
      </form>

      <p className="text-center font-serif text-sm text-muted-foreground">
        已有账号？{' '}
        <Link href="/login" className="font-sans font-medium text-primary underline-offset-4 hover:underline">
          去登录
        </Link>
      </p>
    </div>
  )
}
