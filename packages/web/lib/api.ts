import { useAuthStore } from './store'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

// 防止并发请求同时触发 401 导致重复跳转
let isRedirecting = false

// 统一 fetch 封装：自动带 token、401 清空登录态并跳登录页
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    useAuthStore.getState().clearAuth()
    // 防重入：并发请求只在第一次触发跳转，并携带回调地址以便登录后返回
    if (typeof window !== 'undefined' && !isRedirecting) {
      isRedirecting = true
      const currentPath = window.location.pathname + window.location.search
      const loginUrl = currentPath !== '/login'
        ? `/login?redirect=${encodeURIComponent(currentPath)}`
        : '/login'
      window.location.assign(loginUrl)
    }
    throw new ApiError('未登录或登录已过期', 401)
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(data?.error || `请求失败 (${res.status})`, res.status)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
