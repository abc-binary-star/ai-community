'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from 'shared'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  setUser: (user: User) => void
}

// 认证状态：token + user 持久化到 localStorage
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      setUser: (user) => set({ user }),
    }),
    { name: 'aicom-auth' },
  ),
)
