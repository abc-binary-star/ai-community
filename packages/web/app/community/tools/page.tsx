import Link from 'next/link'
import { ArrowUpRight, Wrench } from 'lucide-react'

// 实用工具列表（独立个人应用，社区前端提供统一入口）
const TOOLS = [] as const

export const metadata = {
  title: '实用工具 · Commons',
  description: '可用的实用工具集合',
}

export default function ToolsIndexPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-card text-primary">
          <Wrench className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">实用工具</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">独立运行的个人工具，随取随用</p>
        </div>
      </div>

      <div className="space-y-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.slug}
              href={`/community/tools/${tool.slug}`}
              className="group flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/50"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  {tool.name}
                  <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                  {tool.description}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-green-600/30 bg-green-600/10 px-2.5 py-1 text-xs text-green-600">
                {tool.status}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
