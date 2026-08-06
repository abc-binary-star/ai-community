'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Annotation, AnnotationList, AnnotationReply, Paginated } from 'shared'

// 想法列表查询键：帖子维度，列表/计数/点赞态共享
export const annotationsKey = (postId: string) => ['annotations', postId] as const

// 获取帖子想法列表 + 各段落公开计数
export function useAnnotationsQuery(postId: string, anchor?: string) {
  return useQuery({
    queryKey: [...annotationsKey(postId), anchor ?? ''],
    queryFn: () =>
      api.get<AnnotationList>(
        `/posts/${postId}/annotations${anchor ? `?anchor=${encodeURIComponent(anchor)}` : ''}`,
      ),
  })
}

export interface CreateAnnotationInput {
  scope: 'selection' | 'paragraph'
  anchor: string
  startOffset: number
  endOffset: number
  selectedText: string
  prefix?: string
  suffix?: string
  paragraphSnapshot?: string
  body: string
  visibility: 'public' | 'private'
}

export function useCreateAnnotation(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnnotationInput) =>
      api.post<Annotation>(`/posts/${postId}/annotations`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

export function useUpdateAnnotation(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
      visibility,
    }: {
      id: string
      body?: string
      visibility?: 'public' | 'private'
    }) => api.patch<Annotation>(`/posts/${postId}/annotations/${id}`, { body, visibility }),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

export function useDeleteAnnotation(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/posts/${postId}/annotations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

export function useCreateAnnotationReply(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      annotationId,
      body,
      replyToUserId,
    }: {
      annotationId: string
      body: string
      replyToUserId?: string
    }) =>
      api.post<AnnotationReply>(
        `/posts/${postId}/annotations/${annotationId}/replies`,
        { body, replyToUserId },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

export function useUpdateAnnotationReply(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ replyId, body }: { replyId: string; body: string }) =>
      api.patch<AnnotationReply>(`/annotation-replies/${replyId}`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

export function useDeleteAnnotationReply(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (replyId: string) => api.del(`/annotation-replies/${replyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

export function useToggleAnnotationLike(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ annotationId, liked }: { annotationId: string; liked: boolean }) =>
      liked
        ? api.del<{ liked: boolean; likeCount: number }>(
            `/posts/${postId}/annotations/${annotationId}/like`,
          )
        : api.post<{ liked: boolean; likeCount: number }>(
            `/posts/${postId}/annotations/${annotationId}/like`,
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: annotationsKey(postId) }),
  })
}

// 加载更多回复（首屏只返回前 3 条）
export async function fetchAnnotationReplies(
  postId: string,
  annotationId: string,
  total: number,
): Promise<AnnotationReply[]> {
  const res = await api.get<Paginated<AnnotationReply>>(
    `/posts/${postId}/annotations/${annotationId}/replies?page=1&pageSize=${Math.max(total, 3)}`,
  )
  return res.items
}
