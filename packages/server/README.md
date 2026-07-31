# packages/server — 🏠 社区底座

AI Community 的后端，提供频道/帖子/成员的核心模型与检索网关，类 Discord 结构。

## 定位（L3）

社区数据与交互的底座。复用类 Discord 的频道/帖子/成员模型（参考 TailChat），向上为 L0 卡片层提供数据 API，向下持久化社区数据。同时作为「检索网关」，统一对接 L1 AI 服务与 L2 推荐。

## 技术栈

- Node.js + TypeScript
- HTTP 框架：Hono / Fastify（待定）
- ORM：Prisma（PostgreSQL）
- 认证：待定（NextAuth / 自建）

## 子模块

```
server/src/
├── modules/
│   ├── channel/     # 频道（类 Discord）
│   ├── post/        # 帖子（类贴吧）
│   ├── member/      # 成员
│   └── search/      # 检索网关：统一对接 L1 AI 服务与 L2 推荐
├── middleware/
├── db/              # Prisma schema 与连接
└── index.ts
```

## 检索网关（search 模块）

`modules/search/` 是关键集成点：接收 L0 的检索/推荐请求，路由到：
- L1 `ai-service`：RAG 检索、Agent 多步检索、AI 策展
- L2 `recommendation`：个性化排序
- L2 `profile`：读取用户画像

## 数据模型（核心实体）

- **Channel**：频道，类 Discord 的内容分区
- **Post / Thread**：帖子/主题帖，类贴吧
- **Reply**：回复
- **Member**：社区成员
- **Behavior**：浏览/发帖行为（供 L2 画像与推荐消费）

## 对接

- 数据存 PostgreSQL（`services/postgres`）
- 行为事件可入 Redis（`services/redis`）做流式消费
- 通过 `packages/shared` 与前端/AI 服务共享类型
