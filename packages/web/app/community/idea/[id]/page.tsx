import { IdeaDetailView } from '../../components/idea-detail'

// 想法详情页（动态路由 [id]）：给单条想法一个可分享的独立地址
export default function IdeaDetailPage({ params }: { params: { id: string } }) {
  return <IdeaDetailView id={params.id} />
}
