# Commons 兴趣社区 v1 基础功能需求规格

> 目标：跑通一个类贴吧/论坛的发帖社区最小闭环。注册 → 浏览 → 发帖 → 评论回复 → 管理（作者删除）。

## 1. 目标与范围

### 1.1 功能闭环
```
注册 / 登录  →  浏览频道列表 →  发帖  →  看帖详情  →  评论 / 回复 → 作者删除
```

### 1.2 非目标（v1 不做）
- 点赞/收藏、关注用户、举报审核、私信通知
- 富文本/图片上传、Markdown 编辑器
- 频道创建、用户权限（管理员/版主）
- AI 能力接入（L2/L3 层，后续迭代）
- 移动端 App、深色模式切换

## 2. 用户故事

| ID | 作为 | 我想要 | 以便于 | 优先级 |
|---|---|---|---|---|
| U1 | 访客 | 注册账号 | 以我的身份发帖和评论 | P0 |
| U2 | 访客 | 用已有账号登录 | 恢复我的登录状态 | P0 |
| U3 | 用户 | 在某个频道里发帖 | 分享我想讨论的内容 | P0 |
| U4 | 用户 | 浏览频道内的帖子列表，分页切换 | 不被大量内容淹没 | P0 |
| U5 | 用户 | 打开帖子看全文 | 了解讨论完整内容 | P0 |
| U6 | 用户 | 对帖子发表评论 | 表达我的看法 | P0 |
| U7 | 用户 | 回复他人的评论（嵌套） | 展开具体讨论 | P0 |
| U8 | 作者 | 删除我自己发布的帖子 | 修正误操作或后悔发布 | P0 |
| U9 | 作者 | 删除我自己发布的评论 | 修正误操作 | P0 |
| U10 | 未登录用户 | 也能浏览帖子列表与详情 | 先感受社区内容再决定注册 | P1 |

## 3. 数据模型

### 3.1 User（用户）
| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| username | text | 2-20 字符，唯一，非空 |
| email | text | 唯一，非空 |
| passwordHash | text | 非空 |
| createdAt / updatedAt | timestamp | 非空 |

### 3.2 Post（帖子）
| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| title | text | 1-100 字符，非空 |
| content | text | 1-20000 字符，非空（纯文本） |
| channel | text | 非空，枚举：general/tech/design/gaming/life |
| authorId | uuid | FK → User.id，非空 |
| commentCount | int | 默认 0，非空 |
| createdAt / updatedAt | timestamp | 非空 |

### 3.3 Comment（评论，自关联支持嵌套）
| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| content | text | 1-2000 字符，非空 |
| postId | uuid | FK → Post.id，非空，索引 |
| authorId | uuid | FK → User.id，非空 |
| parentId | uuid | FK → Comment.id，可空（根评论为空） |
| createdAt | timestamp | 非空 |

级联删除：删除帖子 → 删除所有评论；删除父评论 → 级联删除子回复。

### 3.4 频道枚举
```ts
CHANNELS = ['general', 'tech', 'design', 'gaming', 'life']
CHANNEL_LABELS = {
  general: '综合讨论',
  tech:    '技术前沿',
  design:  '设计美学',
  gaming:  '游戏天地',
  life:    '生活方式',
}
```

## 4. API 接口

基础 URL：`/api`，所有返回 JSON。认证通过 `Authorization: Bearer <jwt>`。

### 4.1 认证

| 方法 | 路径 | 鉴权 | 请求体 | 响应 2xx | 4xx |
|---|---|---|---|---|---|
| POST | /auth/register | 无 | `{ username, email, password }` | `{ token, user: User }` | 409 邮箱已存在 / 字段校验 |
| POST | /auth/login    | 无 | `{ email, password }` | `{ token, user: User }` | 401 邮箱或密码错误 |
| GET  | /auth/me       | Bearer | - | `User` | 401 token 无效 |

### 4.2 帖子

| 方法 | 路径 | 鉴权 | 请求 | 响应 2xx | 4xx |
|---|---|---|---|---|---|
| GET  | /posts?channel&page&pageSize | 无 | query | `{ items: Post[], page, pageSize, total, totalPages }` | - |
| GET  | /posts/:id | 无 | - | `Post (含 author)` | 404 不存在 |
| POST | /posts | Bearer | `{ title, content, channel }` | `Post` | 400 字段 / 401 |
| PUT  | /posts/:id | Bearer 且作者 | `{ title?, content? }` | `Post` | 403 非作者 / 404 |
| DELETE | /posts/:id | Bearer 且作者 | - | `{ ok: true }` | 403 / 404 |

*注：PUT 编辑 v1 前端暂未开放，但后端保留以支撑后续功能。*

### 4.3 评论

| 方法 | 路径 | 鉴权 | 请求 | 响应 2xx | 4xx |
|---|---|---|---|---|---|
| GET  | /posts/:id/comments | 无 | - | `{ items: Comment[]（已按 parent 嵌套成树） }` | 404 |
| POST | /posts/:id/comments | Bearer | `{ content, parentId? }` | `Comment` | 400 / 401 / 404 |
| DELETE | /comments/:id | Bearer 且作者 | - | `{ ok: true }`，级联删回复 | 403 / 404 |

## 5. 前端路由（Next.js）

| 路径 | 页面 | 鉴权要求 |
|---|---|---|
| / | 根，重定向 /community | - |
| /community | 帖子列表（频道通过 `?channel=` 切） | 未登录可看 |
| /community/post/new | 发帖页 | 需要登录，未登录跳 /login |
| /community/post/[id] | 帖子详情 + 评论区 | 未登录可看，评论需登录 |
| /login | 登录页 | - |
| /register | 注册页 | - |

## 6. 界面（基于清爽蓝色 Clear Sky 主题）

### 6.1 导航栏
- 左：品牌 C 圆角方块 + Commons 文字
- 中：频道 chip，选中为浅蓝底蓝字（primary/10）
- 右：未登录 → 登录/注册按钮；已登录 → 发帖按钮 + 头像下拉菜单（退出登录）

### 6.2 帖子列表
- 布局：最大 3xl 居中，网格式白色卡片列表（单列）
- 每张卡：频道 Badge + 时间（右上角） → 标题 → 摘要 2 行 → 作者头像 + 名字 + 评论数
- hover：上浮 0.5px，阴影加深

### 6.3 发帖页
- Card 容器：频道 chip 选择（必填，默认 general）→ 标题 Input → 内容 Textarea（10 行）→ 底部取消/发布

### 6.4 详情页
- 帖子 Card：频道 Badge + 时间 → 标题 → 作者行（头像/名字 + 删帖按钮作者可见） → 正文
- 下方评论列表：根评论左边框 primary、回复左边框 primary/40 + 16px 缩进
- 评论表单：Textarea + 评论/回复按钮，回复时显示 "回复 @xxx" + 取消

## 7. 鉴权与安全

1. 密码哈希：bcrypt cost 10
2. JWT：HS256，exp 7 天，sub 为 userId
3. 前端：token 存 localStorage（user 存 zustand），请求走 axios interceptor 注入 header
4. 路由保护：发帖页/评论 POST → 未登录跳 /login
5. 删除操作：后端严格校验 authorId 与当前 token userId 一致
6. XSS：内容走 React 默认转义渲染（`whitespace-pre-wrap`），不使用 dangerouslySetInnerHTML

## 8. 错误处理

| 位置 | 行为 |
|---|---|
| API 全局 | Hono middleware 捕获异常 → 4xx JSON `{ message }` / 500 通用 "服务器错误" |
| 前端 axios | 拦截器统一读 res message → toast 提示；401 自动清 token + 跳 /login |
| 空数据 | 帖子列表空：虚线边框 + "抢先发帖"按钮；评论空：灰色提示文字 |
| 加载中 | Loader2 转圈 + "加载中…"（匹配主题 muted-foreground） |
| 删除确认 | 帖子/评论删除均走 window.confirm 二次确认 |

## 9. 验收标准（完成定义）

### 9.1 手动端到端
- [ ] 注册一个新账号 → 自动登录 → 回到 /community，nav 显示用户名
- [ ] 退出登录 → 再登录 → 保持正确账号态
- [ ] 在 tech 频道发帖（含标题/内容）→ 跳转详情页 → 回 /community?channel=tech 可见该帖排在首条
- [ ] 匿名访问 /community 和 /community/post/:id → 可读但不能评论/发帖（跳登录）
- [ ] 对新帖发表评论 A → A 显示在列表中
- [ ] 回复评论 A 生成评论 B → B 嵌套显示（缩进 + 标签）
- [ ] 作者身份删除评论 B → B 从列表消失；删除帖子 → 列表消失，访问旧 ID 返回 404
- [ ] 分页：≥ 21 条帖子时，翻页 2 可看到第 21 条
- [ ] 所有按钮 hover/active/focus 交互有视觉反馈
- [ ] 未授权访问 /community/post/new → 自动跳 /login

### 9.2 非功能
- [ ] Typecheck：`pnpm --filter web typecheck` 无报错；`pnpm --filter server build` 无报错
- [ ] 前端 build：Next.js 8 个路由全部生成（含 catch-all / 动态）
- [ ] API 自动化（curl/手动）对 4.1-4.3 每条至少一条成功和一条失败的验证

## 10. 风险与后续

- v1 采用纯文本内容，富文本/图片在 v2 引入，需额外存储与审查
- 频道硬编码 5 个，后续若要自定义需引入 Channel 表 + 管理后台
- 评论列表未分页，超长帖（> 500 条）需增加分页/折叠
