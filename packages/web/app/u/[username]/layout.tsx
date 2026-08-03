import { Navbar } from '@/app/community/components/navbar'

export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-8">{children}</main>
    </div>
  )
}
