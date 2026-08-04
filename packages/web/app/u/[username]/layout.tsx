import { CommunityShell } from '@/app/community/components/community-shell'

export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
  return <CommunityShell>{children}</CommunityShell>
}
