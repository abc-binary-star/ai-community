import type { Metadata } from 'next'
import { Navbar } from '../components/navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollText, Heart, MessageCircle, ShieldCheck, Users, Sparkles, Ban, AlertTriangle } from 'lucide-react'

export const metadata: Metadata = {
  title: '社区公约 · Commons',
  description: 'Commons 社区行为规范与准则',
}

const guidelines = [
  {
    icon: Heart,
    title: '友善尊重',
    rules: [
      '尊重每一位社区成员，不因身份、背景、技术水平差异而歧视他人',
      '理性讨论，对事不对人，不进行人身攻击或恶意嘲讽',
      '包容不同观点，即使不认同也请保持礼貌',
    ],
  },
  {
    icon: MessageCircle,
    title: '优质内容',
    rules: [
      '发帖前先搜索是否已有类似讨论，避免重复发帖',
      '技术帖请提供足够的信息（代码、错误信息、环境等），方便他人帮助',
      '分享原创内容时请注明出处，转载内容请注明原作者',
      '善用 AI 辅助工具提升内容质量，但请对发布的内容负责',
    ],
  },
  {
    icon: ShieldCheck,
    title: '禁止行为',
    rules: [
      '禁止发布垃圾广告、推广链接、钓鱼网站',
      '禁止发布违法违规内容，包括但不限于色情、暴力、恐怖主义相关内容',
      '禁止侵犯他人隐私，未经许可不得泄露他人个人信息',
      '禁止恶意刷屏、灌水、大量无意义回复',
      '禁止利用漏洞破坏社区正常运行',
    ],
  },
  {
    icon: Users,
    title: '社区共建',
    rules: [
      '积极举报违规内容，帮助维护社区环境',
      '对优质内容点赞、收藏，鼓励创作者持续产出',
      '帮助新成员融入社区，耐心解答问题',
      '尊重版主和管理员的管理工作，有异议可通过申诉渠道沟通',
    ],
  },
  {
    icon: Sparkles,
    title: 'AI 使用规范',
    rules: [
      'AI 生成的内容需经过人工审核后发布，对内容准确性负责',
      '不得利用 AI 生成大量低质内容刷屏',
      '不得利用 AI 仿冒他人身份或伪造信息',
    ],
  },
]

const penalties = [
  { level: '提醒', desc: '首次轻微违规，私信提醒注意事项' },
  { level: '警告', desc: '重复违规或较严重违规，公开警告并记录' },
  { level: '禁言', desc: '严重违规或屡教不改，暂时禁止发帖和评论（1-7天）' },
  { level: '封禁', desc: '极端严重违规，永久封禁账号' },
]

export default function GuidelinesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <ScrollText className="size-7 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl font-semibold">Commons 社区公约</h1>
            <p className="mt-2 text-muted-foreground">
              我们致力于打造一个友善、开放、有价值的兴趣社区。请遵守以下规范。
            </p>
          </div>

          {guidelines.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <section.icon className="size-5 text-primary" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {section.rules.map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/40" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="size-5 text-destructive" />
                违规处理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {penalties.map((p) => (
                  <div key={p.level} className="flex items-start gap-3">
                    <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {p.level}
                    </span>
                    <span className="text-sm text-foreground/80">{p.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="size-5 shrink-0 text-amber-600" />
              <div className="text-sm text-foreground/80">
                <p className="font-medium text-amber-700">申诉机制</p>
                <p className="mt-1">
                  如果你认为处罚有误，可以通过私信联系管理员或在设置页提交申诉。我们会在 3 个工作日内复核。
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            最后更新：2026 年 8 月 · Commons 社区团队保留对本公约的最终解释权
          </p>
        </div>
      </main>
    </div>
  )
}
