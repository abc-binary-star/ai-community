import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'EPUB 翻译 · Commons 实用工具',
  description: '上传外文 EPUB，AI 分章解析、保持版式，输出简体中文版',
}

// 独立工具服务地址（社区前端通过 iframe 嵌入，支持环境变量覆盖）
const TOOL_URL = process.env.NEXT_PUBLIC_EPUB_TRANSLATOR_URL || 'http://localhost:8888'

export default function EPUBTranslatorToolPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">EPUB 翻译</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传外文 EPUB，AI Agent 分章解析、保持版式，输出简体中文版
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={TOOL_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1 size-4" />
            新窗口打开
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <iframe
          src={TOOL_URL}
          title="EPUB 翻译工具"
          className="h-[calc(100dvh-15rem)] min-h-[520px] w-full"
        />
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        工具独立运行于{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{TOOL_URL}</code>
        ，若页面空白请确认 epub-translator 服务已启动
      </p>
    </div>
  )
}
