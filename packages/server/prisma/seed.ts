import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const pwd = await bcrypt.hash('123456', 12)

  const alice = await prisma.user.upsert({
    where: { email: 'alice@demo.com' },
    update: {},
    create: { username: 'alice', email: 'alice@demo.com', password: pwd },
  })
  const bob = await prisma.user.upsert({
    where: { email: 'bob@demo.com' },
    update: {},
    create: { username: 'bob', email: 'bob@demo.com', password: pwd },
  })

  const p1 = await prisma.post.create({
    data: {
      title: '欢迎来到 AI Community',
      content: '这是一个 AI 原生兴趣社区，欢迎在这里分享你的想法与创作！',
      channel: 'general',
      authorId: alice.id,
    },
  })
  const p2 = await prisma.post.create({
    data: {
      title: '如何用 AI 提升社区内容质量',
      content: '聊聊 AI 在社区内容审核、标签推荐、智能问答等场景的落地实践，欢迎讨论。',
      channel: 'tech',
      authorId: bob.id,
    },
  })

  const c1 = await prisma.comment.create({
    data: { content: '期待更多内容！', postId: p1.id, authorId: bob.id },
  })
  await prisma.comment.create({
    data: { content: '谢谢支持～', postId: p1.id, authorId: alice.id, parentId: c1.id },
  })
  await prisma.comment.create({ data: { content: 'AI 标签推荐确实很实用。', postId: p2.id, authorId: alice.id } })

  console.log('✅ seed 完成')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
