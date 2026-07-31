import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const pwd = await bcrypt.hash('123456', 10)

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
      title: 'SRPG 关卡设计交流',
      content: '聊聊 SRPG 的关卡节奏、地形设计与数值平衡，欢迎讨论。',
      channel: '游戏',
      authorId: bob.id,
    },
  })

  const c1 = await prisma.comment.create({
    data: { content: '期待更多内容！', postId: p1.id, authorId: bob.id },
  })
  await prisma.comment.create({
    data: { content: '谢谢支持～', postId: p1.id, authorId: alice.id, parentId: c1.id },
  })
  await prisma.comment.create({ data: { content: '地形设计是关键。', postId: p2.id, authorId: alice.id } })

  console.log('✅ seed 完成')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
