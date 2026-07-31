import { PostListPage } from './components/post-list'

// 社区首页：读取 channel/page 查询参数，交给客户端列表组件
export default function CommunityPage({
  searchParams,
}: {
  searchParams: { channel?: string; page?: string }
}) {
  const channel = searchParams.channel || 'general'
  const page = Math.max(1, Number(searchParams.page) || 1)
  return <PostListPage channel={channel} page={page} />
}
