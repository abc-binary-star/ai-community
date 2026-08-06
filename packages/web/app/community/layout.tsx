import type { ReactNode } from 'react'
import { CommunityShell } from './components/community-shell'
import { AnnouncementBanner } from './components/announcement-banner'

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <CommunityShell banner={<AnnouncementBanner />}>
      {children}
    </CommunityShell>
  )
}
