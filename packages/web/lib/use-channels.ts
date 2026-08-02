'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Channel } from 'shared'

// 频道列表查询 hook，queryKey: ['channels']
// 频道列表不常变，缓存 5 分钟
export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get<Channel[]>('/channels'),
    staleTime: 5 * 60 * 1000,
  })
}
