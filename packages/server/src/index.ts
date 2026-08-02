import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import auth from './modules/auth.js'
import post from './modules/post.js'
import comment from './modules/comment.js'
import user from './modules/user.js'
import bookmark from './modules/bookmark.js'
import follow from './modules/follow.js'
import notification from './modules/notification.js'
import search from './modules/search.js'
import type { AppEnv } from './types.js'

const app = new Hono<AppEnv>()

// 日志中间件
app.use('*', logger())

// CORS：生产环境从环境变量读取允许的域名（逗号分隔），开发默认 localhost
// 注意：credentials: true 时 origin 不能为 '*'，必须返回具体域名
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim())
app.use(
  '*',
  cors({
    origin: (origin) => {
      // 允许列表里的域名
      if (origin && corsOrigins.includes(origin)) return origin
      // 没带 Origin 的请求（如 curl 直接访问、同源请求）放行但不返回具体域
      if (!origin) return null
      // 开发环境额外允许 localhost 变体（不同端口），但不反射任意 origin
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

// 健康检查
app.get('/api/health', (c) => c.json({ ok: true }))

// 认证路由 /api/auth/*
app.route('/api/auth', auth)

// 帖子路由 /api/posts/*
app.route('/api/posts', post)

// 用户路由 /api/users/*
app.route('/api/users', user)

// 评论路由 /api/posts/:id/comments 与 /api/comments/:id
app.route('/api', comment)

// 收藏路由 /api/posts/:id/bookmark 与 /api/bookmarks
app.route('/api', bookmark)

// 关注路由 /api/users/:username/follow, /api/following/:username, /api/followers/:username
app.route('/api', follow)

// 通知路由 /api/notifications/*
app.route('/api', notification)

// 搜索路由 /api/search
app.route('/api/search', search)

// 统一 404
app.notFound((c) => c.json({ error: '接口不存在' }, 404))

// 统一错误处理
app.onError((err, c) => {
  console.error('未处理错误:', err)
  return c.json({ error: '服务器内部错误' }, 500)
})

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Server running on http://localhost:${info.port}`)
  console.log(`   CORS allowed: ${corsOrigins.join(', ')}`)
})