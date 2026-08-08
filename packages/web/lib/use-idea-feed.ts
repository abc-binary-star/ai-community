'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { IdeaCard as IdeaCardData, IdeaFeed } from 'shared'

export type IdeaFeedSort = 'hot' | 'latest'

export const ideaFeedKey = (sort: IdeaFeedSort) => ['idea-feed', sort] as const

const PAGE_SIZE = 20

/**
 * 想法流：以「想法」为最小单元的跨帖信息流。
 *
 * 流里混排两种卡——真实的公开段落想法，以及为还没有想法的帖子生成的摘录卡。
 * 用无限滚动而非分页器：想法流是用来发现和闲逛的，翻页器会打断这个节奏。
 */
export function useIdeaFeedQuery(sort: IdeaFeedSort = 'hot') {
  return useInfiniteQuery({
    queryKey: ideaFeedKey(sort),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<IdeaFeed>(`/ideas?sort=${sort}&page=${pageParam}&pageSize=${PAGE_SIZE}`),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  })
}

/** 单条想法：供想法详情页与分享链接使用 */
export function useIdeaQuery(id: string) {
  return useQuery({
    queryKey: ['idea', id],
    queryFn: () => api.get<IdeaCardData>(`/ideas/${id}`),
    enabled: !!id,
  })
}
