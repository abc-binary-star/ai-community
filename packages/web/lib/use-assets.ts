'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  Asset,
  AssetRun,
  BindPostAssetInput,
  CreateAssetInput,
  Paginated,
  RemixFromRunInput,
  RunAssetInput,
  RunAssetResult,
  UpdateAssetInput,
  PostAsset,
} from 'shared'

// --- 资产 CRUD（B1）---

export const assetsKey = ['assets'] as const

export function useAssetsQuery(params?: {
  authorId?: string
  type?: string
  keyword?: string
  page?: number
  pageSize?: number
}) {
  const qs = new URLSearchParams()
  if (params?.authorId) qs.set('authorId', params.authorId)
  if (params?.type) qs.set('type', params.type)
  if (params?.keyword) qs.set('keyword', params.keyword)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize))
  const query = qs.toString()
  return useQuery({
    queryKey: [...assetsKey, 'list', params ?? {}],
    queryFn: () => api.get<Paginated<Asset>>(`/assets${query ? `?${query}` : ''}`),
  })
}

export function useAssetQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: [...assetsKey, 'detail', id],
    queryFn: () => api.get<Asset>(`/assets/${id}`),
    enabled: !!id && enabled,
  })
}

export function useMyAssetsQuery(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...assetsKey, 'mine', { page, pageSize }],
    queryFn: () =>
      api.get<Paginated<Asset>>(`/assets/me?page=${page}&pageSize=${pageSize}`),
  })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAssetInput) => api.post<Asset>('/assets', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetsKey }),
  })
}

export function useUpdateAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateAssetInput) => api.put<Asset>(`/assets/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...assetsKey, 'detail', id] })
      qc.invalidateQueries({ queryKey: [...assetsKey, 'list'] })
    },
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetsKey }),
  })
}

// --- 帖子-资产绑定（B2）---

export const postAssetsKey = (postId: string) => ['post-assets', postId] as const

export function usePostAssetsQuery(postId: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...postAssetsKey(postId), { page, pageSize }],
    queryFn: () =>
      api.get<Paginated<PostAsset>>(
        `/posts/${postId}/assets?page=${page}&pageSize=${pageSize}`,
      ),
    enabled: !!postId,
  })
}

export function useBindPostAsset(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BindPostAssetInput) =>
      api.post<PostAsset>(`/posts/${postId}/assets`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: postAssetsKey(postId) }),
  })
}

export function useUnbindPostAsset(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assetId: string) => api.del(`/posts/${postId}/assets/${assetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: postAssetsKey(postId) }),
  })
}

// --- 资产试玩（B3）---

export function useRunAsset(id: string) {
  return useMutation({
    mutationFn: (input: RunAssetInput) =>
      api.post<RunAssetResult>(`/assets/${id}/run`, input),
  })
}

// --- 运行快照（B4）---

export const assetRunsKey = ['asset-runs'] as const

export function useRunQuery(runId: string, enabled = true) {
  return useQuery({
    queryKey: [...assetRunsKey, 'detail', runId],
    queryFn: () => api.get<AssetRun>(`/assets/runs/${runId}`),
    enabled: !!runId && enabled,
  })
}

export function useAssetRunsQuery(assetId: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...assetRunsKey, 'asset', assetId, { page, pageSize }],
    queryFn: () =>
      api.get<Paginated<AssetRun>>(
        `/assets/${assetId}/runs?page=${page}&pageSize=${pageSize}`,
      ),
    enabled: !!assetId,
  })
}

export function useMyRunsQuery(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...assetRunsKey, 'mine', { page, pageSize }],
    queryFn: () =>
      api.get<Paginated<AssetRun>>(`/assets/runs/me?page=${page}&pageSize=${pageSize}`),
  })
}

export function useUpdateRunVisibility(runId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (visibility: 'private' | 'public') =>
      api.put<AssetRun>(`/assets/runs/${runId}/visibility`, { visibility }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...assetRunsKey, 'detail', runId] })
      qc.invalidateQueries({ queryKey: [...assetRunsKey, 'asset', data.assetId] })
      qc.invalidateQueries({ queryKey: [...assetRunsKey, 'mine'] })
    },
  })
}

// --- B5：复现 / Remix ---

export function useReplayRun() {
  return useMutation({
    mutationFn: (runId: string) =>
      api.post<RunAssetResult>(`/assets/runs/${runId}/replay`),
  })
}

export function useRemixFromRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, input }: { runId: string; input: RemixFromRunInput }) =>
      api.post<Asset>(`/assets/runs/${runId}/remix`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetsKey }),
  })
}
