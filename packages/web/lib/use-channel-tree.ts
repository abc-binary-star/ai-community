'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { ChannelTree } from 'shared'

// 频道树查询 hook，queryKey: ['channel-tree']
// 包含分组 + 频道，缓存 5 分钟
export function useChannelTree() {
  return useQuery({
    queryKey: ['channel-tree'],
    queryFn: () => api.get<ChannelTree>('/channels/tree'),
    staleTime: 5 * 60 * 1000,
  })
}
