import { Suspense } from 'react'
import { ProfileClient } from './profile-client'

export default function UserProfilePage({ params }: { params: { username: string } }) {
  return (
    <Suspense>
      <ProfileClient username={decodeURIComponent(params.username)} />
    </Suspense>
  )
}
