'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const searchParams = useSearchParams()
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
      setAuth(data.token, data.refreshToken, data.user)
      toast.success('注册成功，已自动登录')
      // 与登录页一致：支持 redirect 参数跳回原页面（校验防止开放重定向）
      const redirect = searchParams.get('redirect')
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/community'
      router.push(safeRedirect)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '注册失败，请重试')
    }
  }

  return (
    <Card className="w-full max-w-md animate-slide-up">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl">创建账号</CardTitle>
        <CardDescription>加入 Commons，开启你的兴趣之旅</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input id="username" placeholder="2-20 个字符" {...register('username')} />
            {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPwd ? '隐藏密码' : '显示密码'}
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            注册
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            已有账号？{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              去登录
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            注册即表示同意{' '}
            <Link href="/community/guidelines" className="font-medium text-primary hover:underline">
              社区公约
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
