import { Suspense } from 'react'
import { ProfileClient } from './profile-client'
import { Navbar } from '@/app/community/components/navbar'

export default function UserProfilePage({ params }: { params: { username: string } }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-8">
        <Suspense>
          <ProfileClient username={decodeURIComponent(params.username)} />
        </Suspense>
      </main>
    </div>
  )
}
