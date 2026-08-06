import type { User } from 'shared'
import { useAuthStore } from './store'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

/** 拉取当前登录用户完整信息（含 role），用于修复旧缓存 user 缺字段的问题 */
export function fetchMe(): Promise<User> {
  return apiFetch<User>('/auth/me')
}

export class ApiError extends Error {
  status: number
  /** 原始响应体，供需要结构化错误详情的调用方读取（如查重命中的书名与格子） */
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
    this.name = 'ApiError'
  }
}

// 防止并发请求同时触发 401 导致重复跳转
let isRedirecting = false

// refresh token 单例锁：并发 401 时只刷新一次
let refreshPromise: Promise<boolean> | null = null

// 尝试用 refreshToken 刷新 access token，成功返回 true
async function tryRefresh(): Promise<boolean> {
  const { refreshToken, setToken, clearAuth } = useAuthStore.getState()
  if (!refreshToken) return false

  // 已有刷新请求在进行中，复用它
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) {
        clearAuth()
        return false
      }
      const data = await res.json()
      setToken(data.token, data.refreshToken)
      return true
    } catch {
      clearAuth()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// 跳转登录页（带防重入和 redirect 参数）
function redirectToLogin() {
  if (typeof window !== 'undefined' && !isRedirecting) {
    isRedirecting = true
    const currentPath = window.location.pathname + window.location.search
    const loginUrl = currentPath !== '/login'
      ? `/login?redirect=${encodeURIComponent(currentPath)}`
      : '/login'
    window.location.assign(loginUrl)
  }
}

// 认证相关接口的 401 是"密码错误"而非"会话过期"，不应触发 refresh/redirect
function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/auth/login') || path.startsWith('/auth/register')
}

// 统一 fetch 封装：自动带 token、401 时尝试 refresh 续命，失败再跳登录页
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const makeRequest = async (): Promise<Response> => {
    const token = useAuthStore.getState().token
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    }
    // FormData 时让浏览器自动设置 Content-Type（含 boundary），不手动覆盖
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    try {
      return await fetch(`${BASE}${path}`, { ...options, headers })
    } catch {
      // 网络错误（DNS 失败、CORS、离线等）统一转为 ApiError
      throw new ApiError('网络连接失败，请检查网络后重试', 0)
    }
  }

  let res = await makeRequest()

  // 认证接口的 401 是"密码错误"，直接走正常错误处理
  if (res.status === 401 && !isAuthEndpoint(path)) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await makeRequest()
    }

    // refresh 后仍然 401，清空登录态跳登录页
    if (res.status === 401) {
      useAuthStore.getState().clearAuth()
      redirectToLogin()
      throw new ApiError('未登录或登录已过期', 401)
    }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(data?.error || `请求失败 (${res.status})`, res.status, data)
  }
  return data as T
}

export async function apiFetchStream(path: string, options: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(data?.error || `请求失败 (${res.status})`, res.status)
  }
  return res
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
