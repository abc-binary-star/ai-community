'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from 'shared'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  setAuth: (token: string, refreshToken: string, user: User) => void
  setToken: (token: string, refreshToken: string) => void
  clearAuth: () => void
  setUser: (user: User) => void
}

// 认证状态：token + refreshToken + user 持久化到 localStorage
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      setToken: (token, refreshToken) => set({ token, refreshToken }),
      clearAuth: () => set({ token: null, refreshToken: null, user: null }),
      setUser: (user) => set({ user }),
    }),
    { name: 'aicom-auth' },
  ),
)
