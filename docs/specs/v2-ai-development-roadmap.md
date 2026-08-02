# Commons 社区 v2 AI 功能开发路线

> 基于 `docs/specs/v2-ai-native-community.md` 需求规格，将 20 个 AI 功能按依赖关系和实现难度分为六阶，每阶可独立上线验证。一阶完成后，后续每阶的新功能只需调用 `pkg/ai.Chat()` 一行接入 LLM。

## 技术现状

| 维度 | 现状 | 说明 |
|------|------|------|
| 后端 | Go (Hertz + GORM) | 统一后端，GORM AutoMigrate 自动建表 |
| AI 网关 | `server-go/internal/pkg/ai` | 一阶已完成，统一封装 DeepSeek 调用 |
| 现有 AI 能力 | AI 标签 + 讨论摘要 | 两处均已重构为复用网关 |
| 向量数据库 | pgvector (已装镜像) | PostgreSQL 扩展，未启用列和索引 |
| 缓存 | 未接入 Redis | docker-compose 已编排，Go 侧未接客户端 |
| ai-service (Python) | 仅 README | L1 层规划，v2 按需新建 |

## 六阶路线总览

| 阶 | 名称 | 难度 | 功能 | 交付目标 |
|----|------|------|------|----------|
| 一 | AI 网关 | ★ | LLM 调用层收敛 | 所有 AI 调用走统一入口 |
| 二 | 无状态创作 | ★★ | F2 标题建议、F6 评论润色 | 发帖/评论有 AI 辅助 |
| 三 | 编辑器润色 | ★★★ | F1 AI 润色 | 选段/全文润色 + diff 采纳 |
| 四 | 缓存与摘要 | ★★★ | F4 标签缓存、F3/F8 帖子摘要、F10 长文折叠 | 异步任务 + Redis 缓存 |
| 五 | 向量与问答 | ★★★★ | F7 讨论摘要升级、F9 AI 追问 | pgvector + RAG |
| 六 | 画像与治理 | ★★★★-★★★★★ | F11-F20 画像/推荐/策展/搜索/治理 | 个性化 + 治理 AI 化 |

## 一阶：AI 网关（已完成）

**目标**：抽取统一 LLM 调用层，消除重复代码，为后续所有 AI 功能提供地基。

### 改动内容

- 新建 `server-go/internal/pkg/ai/client.go`：`Init(key, url, model)` 初始化 + `Chat(ctx, ChatRequest)` 单入口
- 封装消息组装、鉴权、60s 超时、响应解析
- 支持 `Messages` / `System`+`User` 两种传参方式
- 含 `Enabled()` 降级判断（未配 API Key 时 AI 功能不可用但不崩溃）
- 重构 `SuggestTags` 和 `generateDiscussionSummary` 两处 DeepSeek 直连，复用网关

### 验证结果

- `go build ./...` 通过
- `go vet ./...` 通过
- 全仓 grep 确认 `chat/completions` 只在 `pkg/ai` 内部出现一次

### 净效果

- 删除约 90 行重复代码
- 后续所有 AI 功能只需 `ai.Chat(ctx, ...)` 一行调用

## 二阶：无状态创作

**目标**：在发帖和评论场景增加 AI 辅助，无需新表、无状态，最容易见效。

### F2 AI 标题建议

- **接口**：`POST /api/ai/suggest-title`
- **入参**：`{ content }`（帖子正文）
- **出参**：`{ titles: string[] }`（3 个候选标题）
- **前端**：发帖页标题输入框旁加「AI 建议」按钮，点击后下拉展示候选，一键选用
- **网关调用**：`ai.Chat(ctx, ai.ChatRequest{ System: "...", User: content })`

### F6 评论润色

- **接口**：`POST /api/ai/rewrite`
- **入参**：`{ content, style? }`（评论内容，风格可选简洁/正式/亲和/口语）
- **出参**：`{ result }`（润色后文本）
- **前端**：评论输入框旁加「润色」按钮，点击后替换文本（无 diff，轻量）
- **注意**：此接口在二阶只做评论场景的轻量润色；三阶 F1 会在此基础上扩展为选段润色 + diff

### 验收标准

- 发帖页点「AI 建议」后 3 秒内返回 3 个标题候选
- 评论框点「润色」后文本被替换，可撤销（Ctrl+Z）
- 未配置 DEEPSEEK_API_KEY 时按钮不显示或提示「AI 功能未开启」

## 三阶：编辑器润色

**目标**：在发帖编辑器中实现完整的 AI 润色体验，支持选段润色和 diff 对比采纳。

### F1 AI 润色

- **接口**：扩展 `POST /api/ai/rewrite`，增加 `selection?`（选中文本）和 `style` 参数
- **入参**：`{ content, selection?, style }`
  - `selection` 非空时只润色选段，返回选段结果
  - `selection` 为空时润色全文
- **出参**：`{ result, diff }`（润色结果 + 行级 diff）
- **前端**：
  - `markdown-editor.tsx` 工具栏新增「AI 润色」按钮
  - 选中文字后点击 -> 只润色选段
  - 未选中点击 -> 润色全文
  - 弹出 diff 面板，行级对比原文和润色结果
  - 「采纳」按钮替换正文，「放弃」按钮关闭面板
- **行为约束**：
  - 代码块（` ``` ` 包裹）、引用块（`>` 开头）、URL 不被润色改写
  - 保持作者口吻与事实内容，只修错别字、语病、排版
  - 润色后发布不标识「AI 生成」（创作工具定位）
  - 风格可选：简洁 / 正式 / 亲和 / 口语

### diff 面板实现

- 前端自实行级 diff（基于 `diff` npm 包或简单行对比）
- 绿色背景表示新增行，红色背景表示删除行
- 不引入重型 diff 库，保持 bundle 体积

### 验收标准

- 选段润色：选中一段文字 -> 点 AI 润色 -> diff 面板只显示选段的改动
- 全文润色：未选中 -> 点 AI 润色 -> diff 面板显示全文改动
- 代码块内容不被改写
- 采纳后正文更新，放弃后正文不变
- 未登录用户无 AI 润色入口

## 四阶：缓存与摘要

**目标**：引入 Redis 缓存和异步任务机制，实现标签缓存、帖子摘要和长文折叠。

### 前置：Redis 接入

- `go.mod` 添加 `github.com/redis/go-redis/v9`
- `dal` 或新建 `pkg/cache` 包初始化 Redis 客户端
- `main.go` 启动时初始化

### F4 AI 标签缓存

- **缓存 key**：`ai:tags:{md5(title+content)}`
- **缓存 TTL**：7 天
- **流程**：请求标签时先查 Redis -> 命中直接返回 -> 未命中调用 LLM -> 结果写入缓存
- **失败降级**：DeepSeek 不可用时返回空标签数组，不阻塞发帖

### F3 / F8 帖子摘要

- **数据模型**：Post 表新增 `AiSummary`（text）和 `AiSummaryStatus`（string，默认 `none`）
- **触发**：发帖成功后写入 `AiTask` 异步任务
- **异步执行**：goroutine 消费任务 -> 调用 `ai.Chat()` 生成摘要 -> 更新 Post 字段
- **前端展示**：
  - F3 列表卡片：摘要作为副标题展示
  - F8 详情页：顶部展示摘要卡，帮助读者快速理解核心内容
- **状态流转**：`none` -> `generating` -> `done` / `failed`

### F10 长文折叠

- **前端**：超长文（> 2000 字）默认折叠正文，显示摘要入口
- **展开**：点击「展开全文」显示完整内容
- **收起**：阅读后可点击「收起」
- **与 F8 配合**：折叠状态下优先展示 AI 摘要

### AiTask 异步任务表

```go
type AiTask struct {
    ID        string    `gorm:"primaryKey;default:gen_random_uuid()"`
    Type      string    // summarize | rewrite | tag | profile | moderation
    TargetID  string    // 目标帖子/评论 ID
    Status    string    `gorm:"default:pending"` // pending | running | done | failed
    Payload   datatypes.JSON `gorm:"type:jsonb"`
    Result    datatypes.JSON `gorm:"type:jsonb"`
    Retries   int       `gorm:"default:0"`
    CreatedAt time.Time `gorm:"autoCreateTime"`
    UpdatedAt time.Time `gorm:"autoUpdateTime"`
}
```

### 验收标准

- 标签请求第二次命中缓存时 P95 < 50ms，不调用 LLM
- 发帖后 10 秒内摘要生成完成（异步，不阻塞发帖）
- 摘要生成失败时帖子正常发布，`AiSummaryStatus` 为 `failed`
- 长文帖子默认折叠，点击展开/收起正常

## 五阶：向量与问答

**目标**：启用 pgvector，实现讨论摘要升级和社区内容 RAG 问答。

### 前置：pgvector 启用

- `dal.Init` 的 `initSearchIndexes` 中追加 raw SQL：

```go
"CREATE EXTENSION IF NOT EXISTS vector",
"ALTER TABLE posts ADD COLUMN IF NOT EXISTS embedding vector(1536)",
"ALTER TABLE comments ADD COLUMN IF NOT EXISTS embedding vector(1536)",
"CREATE INDEX IF NOT EXISTS idx_posts_embedding ON posts USING ivfflat (embedding vector_cosine_ops)",
"CREATE INDEX IF NOT EXISTS idx_comments_embedding ON comments USING ivfflat (embedding vector_cosine_ops)",
```

- 发帖/评论后异步生成 embedding（调用 embedding API 或本地模型）
- embedding 写入对应列（GORM 不原生支持 vector 类型，用 raw SQL 写入）

### F7 讨论摘要升级

- **现状**：v1 已实现整体文本摘要（评论 >= 20，DeepSeek，DB 缓存）
- **升级内容**：
  - 阈值从 20 降至 10
  - 摘要从整体文本升级为 3-8 条要点卡
  - 每条要点关联 `commentId`，可点击跳转到对应楼层
  - 新评论每增加 10 条标记 `stale = true`，后台增量更新
  - 生成改为异步（不阻塞阅读）
- **新表**：`ThreadSummary`（替代现有 `PostSummary`）

```go
type ThreadSummary struct {
    ID        string          `gorm:"primaryKey;default:gen_random_uuid()"`
    PostID    string          `gorm:"uniqueIndex;not null"`
    Points    datatypes.JSON  `gorm:"type:jsonb"` // [{ text, commentId }]
    Stale     bool            `gorm:"default:false"`
    CreatedAt time.Time       `gorm:"autoCreateTime"`
    UpdatedAt time.Time       `gorm:"autoUpdateTime"`
}
```

- **前端**：详情页顶部展示要点卡列表，每条可点击跳转到对应楼层

### F9 AI 追问

- **接口**：`POST /api/ai/ask`
- **入参**：`{ postId?, question }`
- **流程**（RAG）：
  1. 用户提问
  2. 检索网关：语义搜索社区内容（向量召回 + 关键词混合）
  3. Agent 编排：检索 -> 评估 -> 重检索 -> 生成
  4. 回答 + 引用回链（原帖 ID + 楼层 + 作者）
- **出参**：`{ answer, citations: [{ postId, commentId, author, snippet }] }`
- **行为约束**：
  - 回答必须带引用回链，无引用则拒绝作答
  - 回答顶部固定标注「AI 生成，基于社区已有讨论」
  - 仅检索已发布且未被删除的内容
  - 限流：每用户每分钟 5 次
- **前端**：
  - 帖子详情页底部「问 AI」输入框
  - 发现页提供全局提问入口（跨帖子召回）
  - 回答展示引用回链，可点击跳转

### 验收标准

- 评论数 >= 10 的帖子出现要点卡，点击要点跳转到对应楼层
- 新评论增加后摘要标记过期并后台更新
- 提问后回答包含至少 1 条引用回链，可点击跳转
- 无相关内容的提问返回「社区内暂未找到相关讨论」，不编造
- 被删除帖子的内容不出现在回答中

## 六阶：画像与治理

**目标**：基于前五阶的能力底座，实现个性化推荐、语义搜索和治理 AI 化。

### F11 兴趣画像

- **数据模型**：`UserProfile` 表

```go
type UserProfile struct {
    ID        string          `gorm:"primaryKey;default:gen_random_uuid()"`
    UserID    string          `gorm:"uniqueIndex;not null"`
    Tags      pq.StringArray  `gorm:"type:text[]"`    // 兴趣标签，<= 12 个
    Summary   *string         `gorm:"type:text"`       // 自然语言画像描述
    Status    string          `gorm:"default:pending"`  // pending | ready | cleared
    UpdatedAt time.Time
}
```

- **画像生成**：根据浏览、点赞、收藏、发帖、关注行为聚合
- **更新策略**：行为显著变化后增量更新，或每 24h 异步重算
- **用户控制**：
  - 个人中心查看画像（标签 + 描述）
  - 可编辑或删除标签
  - 可一键清空画像进入匿名浏览模式
- **推荐流配合**：每张卡片展示「为什么推荐」命中的画像标签

### F12 个性化推荐

- 首页推荐流按用户兴趣画像排序
- 每张卡片展示「为什么推荐」理由
- **冷启动**：新用户无画像时用内容特征 embedding 推荐

### F13 AI 策展

- 发现页展示 AI 精选内容（BestBlogs 模式）
- LLM 生成摘要/标签并卡片化展示

### F14 相关讨论

- 帖子详情页底部展示相关帖子
- 基于内容向量相似度召回（依赖五阶 pgvector）

### F15 语义搜索

- 搜索从关键词 ILIKE 升级为关键词 + 向量混合检索
- 命中语义相近内容（如搜「React 卡顿」召回「前端性能优化」）

### F16 同好人物卡

- 基于兴趣画像推荐兴趣相似的活跃用户

### F17 通知摘要

- 未读通知由 AI 汇总成要点

### F18 内容预检

- 发布前用 AI 检测违规/广告内容，友好提示作者修改

### F19 审核辅助

- 举报工单由 AI 预分类，审核员快速定位处理

### F20 社区周报

- 每周为个人生成活动回顾：发了什么、看了什么、收获了什么

### 验收标准

- 新用户浏览/点赞 3 个不同主题后，24h 内生成画像
- 画像页可编辑/删除标签，修改后 10 分钟内推荐流生效
- 清空画像后推荐流不再出现「为什么推荐」标签
- 搜索关键词命中语义相近内容
- 发布违规内容时被预检拦截并提示修改

## 排序逻辑

每阶都在前一阶的地基上叠加，且每阶结束都可独立上线：

1. **一阶是纯重构**，不改任何行为，风险最低，却让后面所有功能少写重复代码
2. **二阶只加「按钮 + 接口」**，无新表、无状态，最容易见到成果
3. **三阶难点在前端**（diff 交互），后端只是给二阶的接口加两个参数
4. **四阶引入 Redis 和异步**，是工程复杂度的第一个台阶
5. **五阶是技术深水区**，向量化 + RAG 编排，依赖四阶的异步任务骨架
6. **六阶功能多但都复用前面能力**，画像/推荐靠行为聚合，治理类只是多调几次网关

## 里程碑对齐

| 里程碑 | 阶 | 交付 |
|--------|------|------|
| M1 AI 创作 | 一 + 二 + 三 | 编辑器完成 AI 化，发布链路带 AI 辅助 |
| M2 AI 阅读 | 四 + 五（F7/F9 部分） | 长讨论可导航，社区内容可问答 |
| M3 AI 发现 | 五（F14/F15 部分）+ 六（F11/F12/F13） | 首页个性化，发现页 AI 策展 |
| M4 AI 治理 | 六（F16-F20） | 治理提效，体验收尾 |

> 里程碑内功能可并行开发，跨里程碑有依赖：M1 的 AI 网关是 M2/M3 的前置；M2 的向量化底座是 M3 推荐与语义搜索的前置。
