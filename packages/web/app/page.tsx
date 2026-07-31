import { redirect } from 'next/navigation'

// 根页面重定向到社区
export default function Home() {
  redirect('/community')
}
