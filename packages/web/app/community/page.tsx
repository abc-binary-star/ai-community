import { Suspense } from 'react'
import { PostListPage } from './components/post-list'
import type { IdeaFeedSort } from '@/lib/use-idea-feed'

export default function CommunityPage({
  searchParams,
}: {
  searchParams: {
    channel?: string
    page?: string
    sort?: string
    q?: string
    tag?: string
    view?: string
    ideaSort?: string
  }
}) {
  const channel = searchParams.channel || 'general'
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1))
  const sort = searchParams.sort || 'latest'
  const q = searchParams.q || ''
  const tag = searchParams.tag || ''
  // 想法流先作为并列视图，不抢首页默认；确认收益后再考虑调整默认值
  const view = searchParams.view === 'ideas' ? 'ideas' : 'posts'
  const ideaSort: IdeaFeedSort = searchParams.ideaSort === 'latest' ? 'latest' : 'hot'
  return (
    <Suspense>
      <PostListPage
        channel={channel}
        page={page}
        sort={sort}
        q={q}
        tag={tag}
        view={view}
        ideaSort={ideaSort}
      />
    </Suspense>
  )
}
