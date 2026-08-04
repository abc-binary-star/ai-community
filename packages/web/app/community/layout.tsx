import type { ReactNode } from 'react'
import { CommunityShell } from './components/community-shell'

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return <CommunityShell>{children}</CommunityShell>
}
