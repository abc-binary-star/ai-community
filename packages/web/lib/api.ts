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

// 统一 fetch 封装：自动带 token、401 时尝试 refresh 续命，失败再跳登录页
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const makeRequest = async (): Promise<Response> => {
    const token = useAuthStore.getState().token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return fetch(`${BASE}${path}`, { ...options, headers })
  }

  let res = await makeRequest()

  // 401 时尝试用 refresh token 续命，成功后重试原请求
  if (res.status === 401) {
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
