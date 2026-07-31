import { PostDetailView } from '../../components/post-detail'

// 帖子详情页（动态路由 [id]），交给客户端组件渲染
export default function PostDetailPage({ params }: { params: { id: string } }) {
  return <PostDetailView id={params.id} />
}
