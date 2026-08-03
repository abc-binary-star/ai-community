import { redirect } from 'next/navigation'

// 根页面重定向到发现页（社区主页）
export default function Home() {
  redirect('/community/discover')
}
