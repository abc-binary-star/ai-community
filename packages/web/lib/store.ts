'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from 'shared'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  /** persist 是否已从 localStorage 恢复完成（SSR 首渲染时为 false，客户端 hydration 后变 true） */
  _hasHydrated: boolean
  setAuth: (token: string, refreshToken: string, user: User) => void
  setToken: (token: string, refreshToken: string) => void
  clearAuth: () => void
  setUser: (user: User) => void
  setHasHydrated: (v: boolean) => void
}

// 认证状态：token + refreshToken + user 持久化到 localStorage
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      _hasHydrated: false,
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      setToken: (token, refreshToken) => set({ token, refreshToken }),
      clearAuth: () => set({ token: null, refreshToken: null, user: null }),
      setUser: (user) => set({ user }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'aicom-auth',
      // _hasHydrated 是运行时 hydration 标记，不应持久化；否则硬刷新时可能先读到旧值
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
