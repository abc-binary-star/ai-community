'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useAuthStore } from './store'
import { useHydrated } from './use-hydrated'
import type { Announcement, AnnouncementBanner, AnnouncementSummary, Paginated } from 'shared'

export const announcementsKey = ['announcements'] as const
export const announcementBannerKey = ['announcement-banner'] as const
export const announcementUnreadKey = ['announcement-unread-count'] as const

export function useAnnouncements(category: string, page: number, status?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' })
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  return useQuery({
    queryKey: [...announcementsKey, category, page, status ?? ''],
    queryFn: () => api.get<Paginated<AnnouncementSummary>>(`/announcements?${params.toString()}`),
  })
}

export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: [...announcementsKey, 'detail', id],
    queryFn: () => api.get<Announcement>(`/announcements/${id}`),
    enabled: !!id,
  })
}

export function useAnnouncementBanner() {
  return useQuery({
    queryKey: announcementBannerKey,
    queryFn: () => api.get<AnnouncementBanner>('/announcements/banner'),
  })
}

export function useAnnouncementUnread() {
  const token = useAuthStore((s) => s.token)
  const hydrated = useHydrated()
  return useQuery({
    queryKey: announcementUnreadKey,
    queryFn: () => api.get<{ count: number }>('/announcements/unread-count'),
    enabled: !!token && hydrated,
    refetchInterval: 30000,
  })
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/announcements/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: announcementsKey })
      qc.invalidateQueries({ queryKey: announcementUnreadKey })
    },
  })
}

export function useMarkAllAnnouncementsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/announcements/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: announcementsKey })
      qc.invalidateQueries({ queryKey: announcementUnreadKey })
    },
  })
}
