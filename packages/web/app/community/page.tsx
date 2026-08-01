import { Suspense } from 'react'
import { PostListPage } from './components/post-list'

export default function CommunityPage({
  searchParams,
}: {
  searchParams: { channel?: string; page?: string; sort?: string; q?: string; tag?: string }
}) {
  const channel = searchParams.channel || 'general'
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1))
  const sort = searchParams.sort || 'latest'
  const q = searchParams.q || ''
  const tag = searchParams.tag || ''
  return (
    <Suspense>
      <PostListPage channel={channel} page={page} sort={sort} q={q} tag={tag} />
    </Suspense>
  )
}
