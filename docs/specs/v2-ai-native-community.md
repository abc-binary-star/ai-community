# Commons 兴趣社区 v2 AI 原生功能需求规格

> 目标：把 AI 作为社区的第一公民融入创作、阅读、发现、互动、治理五个环节，形成「贴吧的讨论氛围 + 原生的 AI 体验」的差异化产品。v1 已完成社区底座（L3），v2 首次启用 L1 AI 服务层与 L2 数据模型层。

## 1. 背景与定位

### 1.1 现状

v1 已上线社区底座功能：注册/登录、频道、发帖、评论嵌套、点赞、收藏、关注、通知、搜索、举报、审核、私信、发现页、Markdown 编辑器、@提及、AI 生成标签。

现有 AI 能力仅「发帖时 AI 生成标签」一处，由 Go 后端 `service.PostService.SuggestTags` 直接调用 DeepSeek。架构文档规划的 L1（ai-service：RAG/Agent/策展/摘要）与 L2（profile 画像 / recommendation 推荐 / knowledge 沉淀）均未实现。

### 1.2 产品定位

- 与贴吧/论坛相比：AI 原生，创作有助手、阅读有导航、发现有个性。
- 与纯 AI 问答产品相比：真实人声与社区关系保留，AI 输出全部回链到原帖与原作者（Reddit Answers 范式）。
- 一句话定位：**AI 增强发现与沉淀，不替代人类生产内容。**

### 1.3 范围界定

v2 聚焦四件事：AI 创作助手（润色/标题/摘要/标签）、AI 阅读导航（讨论摘要/追问）、AI 发现（画像/推荐/策展）、AI 治理（预检/审核）。知识图谱沉淀（Neo4j GraphRAG）不在 v2 范围，作为 v3 数据能力储备。

## 2. 设计原则（v2 红线，贯穿所有功能）

| 原则 | 要求 |
|---|---|
| 真实人声优先 | AI 是助手不是作者；作者保留最终决定权；创作工具（润色/标签/标题建议）不标识，替代阅读与作答的 AI 内容（摘要/回答/策展）必须标识并回链 |
| 引用回链强制 | 所有 AI 输出（摘要/追问/策展/推荐理由）必须回链原帖、楼层、作者 |
| 画像透明 | 兴趣画像用户可见、可编辑、可关闭；推荐展示命中画像标签 |
| 拒绝幻觉 | RAG 无结果时明确告知，不编造社区不存在的观点 |
| 成本可控 | LLM 调用统一走网关，限流、缓存、轻量模型分流 |

## 3. 功能全景

| 环节 | 功能 | 一句话描述 | 优先级 |
|---|---|---|---|
| 创作 | F1 AI 润色 | 选段/全文润色，风格可选，diff 对比采纳 | P0 |
| 创作 | F2 AI 标题建议 | 从正文生成 3 个标题候选 | P1 |
| 创作 | F3 AI 摘要生成 | 发帖时自动生成摘要，供列表卡展示 | P1 |
| 创作 | F4 AI 标签升级 | 现有标签功能迁移到 AI 网关并质量增强 | P0 |
| 创作 | F5 AI 续写 | 卡住时给出续写建议，可插入 | P2 |
| 创作 | F6 评论润色 | 评论输入框轻量润色 | P2 |
| 阅读 | F7 讨论摘要 | 长讨论折叠为要点卡，点击回链楼层 | P0 |
| 阅读 | F8 帖子摘要 | 长文顶部摘要卡 | P1 |
| 阅读 | F9 AI 追问 | 帖子内提问，RAG 召回本帖与相关帖作答并回链 | P0 |
| 阅读 | F10 长文折叠 | 超长文默认折叠 + 摘要入口 | P1 |
| 发现 | F11 兴趣画像 | 行为生成自然语言画像，可见可编辑 | P0 |
| 发现 | F12 个性化推荐 | 首页推荐流，展示推荐理由 | P1 |
| 发现 | F13 AI 策展 | 发现页 AI 精选内容 | P1 |
| 发现 | F14 相关讨论 | 详情页底部相关帖子 | P1 |
| 发现 | F15 语义搜索 | 关键词 + 向量混合检索 | P1 |
| 互动 | F16 同好人物卡 | 兴趣相似用户推荐 | P2 |
| 互动 | F17 通知摘要 | 未读通知 AI 汇总 | P2 |
| 治理 | F18 内容预检 | 发布前检测违规/广告，友好提示 | P1 |
| 治理 | F19 审核辅助 | 举报工单 AI 预分类 | P2 |
| 治理 | F20 社区周报 | 个人每周活动回顾 | P2 |

## 4. 重点功能详述（P0）

### 4.1 F1 AI 润色（创作）

**用户故事**

- 作者在发帖/编辑页选中一段文字，点「AI 润色」，得到 1 份润色结果，diff 高亮显示改动，可一键采纳或放弃。
- 作者可指定风格：简洁 / 正式 / 亲和 / 口语，默认保持原文语气。
- 全文可一键润色；代码块、引用块、URL 不被修改。

**交互设计**

编辑器工具栏新增「AI 润色」入口；未选中文字时润色全文。结果以 diff 视图展示（增删行高亮），提供「采纳」「放弃」「换一种风格」三个操作。采纳后回到编辑器，可继续编辑。

**行为约束**

- 保持作者口吻与事实内容，只修错别字、语病、冗余与结构。
- 润色与拼写检查同类，是创作工具：采纳后发布的帖子不做任何 AI 标识（决策 2026-08-02）。
- 内容上限 20000 字；超过 8000 字分段润色，逐段返回。
- 流式返回，首 token 目标 < 2s；总耗时 < 20s（8000 字内）。

**验收**

- 选段润色与全文润色均可用；diff 视图改动可见、可回退。
- 代码块与引用内容不被改写。
- 采纳润色后发布的帖子不带任何 AI 标识，与普通发布流程一致。

### 4.2 F7 讨论摘要（阅读）

**用户故事**

- 评论数 ≥ 10 的帖子自动在顶部生成「讨论摘要」卡，列出 3-8 条要点，每条可点击跳到对应楼层。
- 作者可手动请求生成；摘要过期（新评论追加）后显示「摘要可能不完整」。

**输出格式**

每条要点 ≤ 40 字，必须关联具体评论 id 作为回链；摘要卡底部固定标注「AI 生成，仅供参考，点击要点直达原楼层」。

**触发与更新**

- 触发：新帖评论数首次达到 10；或帖子被标记为热门；或作者手动请求。
- 更新：摘要生成后每新增 10 条评论，标记摘要过期，后台增量更新。
- 生成异步执行，列表页不阻塞；详情页首次加载显示骨架屏。

**验收**

- 评论数 ≥ 10 的帖子自动出现摘要卡；每条要点可跳转对应楼层。
- 新评论达到阈值后摘要标记过期并后台刷新。
- 摘要生成失败不阻塞帖子阅读，显示静默降级。

### 4.3 F9 AI 追问（阅读 / 社区问答）

**用户故事**

- 帖子详情页底部「问 AI」输入框，用户可就帖子内容提问，得到基于本社区内容的回答。
- 发现页提供全局提问入口，可跨帖子召回。

**流程（对齐架构 L1 RAG 范式）**

```
用户提问 → 检索网关（语义搜索社区内容）→ Agent 编排（检索→评估→重检索→生成）
→ 回答 + 引用回链（原帖 id + 楼层 + 作者）→ L0 追问卡展示
```

**行为约束**

- 回答必须带引用回链，无引用则拒绝作答并提示「社区内暂未找到相关讨论」。
- 回答顶部固定标注「AI 生成，基于社区已有讨论」。
- 仅检索已发布且未被删除、未被举报的内容。
- 限流：每用户每分钟 5 次，避免成本失控。

**验收**

- 提问后回答包含至少 1 条引用回链，可点击跳转原帖/楼层。
- 对无相关内容的提问，明确提示未找到，不编造。
- 被删除帖子的内容不出现在回答中。

### 4.4 F11 兴趣画像（发现 / 数据底座）

**用户故事**

- 系统根据浏览、点赞、收藏、发帖、关注行为，生成一段自然语言兴趣画像。
- 用户在个人中心查看画像，可编辑或删除其中标签。
- 推荐流中每张卡片展示「为什么推荐」：命中画像的标签。

**画像规则**

- 画像由标签（每个 ≤ 6 字，总量 ≤ 12 个）+ 一句自然语言描述组成（GenUP 模式）。
- 更新：行为显著变化后增量更新，或每 24h 异步重算。
- 透明：画像页展示「如何生成」说明；用户可一键清空画像进入匿名浏览模式（推荐退化为内容特征推荐）。

**验收**

- 新用户注册并浏览/点赞 3 个不同主题后，24h 内生成画像。
- 画像页可编辑/删除标签；修改后 10 分钟内推荐流生效。
- 清空画像后，推荐流不再出现「为什么推荐」的画像标签说明。

### 4.5 F4 AI 标签升级（创作 / 网关迁移）

现有 `POST /posts/suggest-tags` 由 Go 后端 `service.PostService.SuggestTags` 直接调用 DeepSeek，存在无缓存问题。v2 将标签能力增强：

- 结合用户兴趣画像个性化推荐标签。
- 服务端缓存（同标题+内容哈希 7 天，Redis），命中缓存不再调用 LLM。
- 失败降级：DeepSeek 不可用时返回空标签，不阻塞发帖。

## 5. 数据模型变更

后端已统一为 Go（Hertz + GORM），以下为新增的 GORM model，加入 `dal.Init` 的 AutoMigrate 列表即可自动建表。

```go
// Post 新增字段（在现有 model.Post 上扩展）
type Post struct {
    // ... 现有字段 ...
    AiSummary       string `gorm:"type:text"`                    // 帖子摘要
    AiSummaryStatus string `gorm:"default:none"`                 // none | generating | done | failed
    AiEdited        bool   `gorm:"default:false"`                // 是否 AI 辅助编辑（F1）
    // embedding 字段需用 pgvector，GORM 不原生支持，通过 raw SQL 创建：
    // ALTER TABLE posts ADD COLUMN embedding vector(1536);
}

// Comment 新增字段
type Comment struct {
    // ... 现有字段 ...
    // embedding 同 Post，通过 raw SQL 添加 vector(1536) 列
}

// UserProfile 兴趣画像（新增表）
type UserProfile struct {
    ID        string    `gorm:"primaryKey;default:gen_random_uuid()"`
    UserID    string    `gorm:"uniqueIndex;not null"`
    Tags      pq.StringArray `gorm:"type:text[]"`               // 兴趣标签，≤ 12 个
    Summary   *string   `gorm:"type:text"`                      // 自然语言画像描述
    Status    string    `gorm:"default:pending"`                // pending | ready | cleared
    UpdatedAt time.Time
}

// ThreadSummary 讨论摘要（新增表，替代现有 PostSummary 的升级版）
type ThreadSummary struct {
    ID        string    `gorm:"primaryKey;default:gen_random_uuid()"`
    PostID    string    `gorm:"uniqueIndex;not null"`
    Points    datatypes.JSON `gorm:"type:jsonb"`                 // [{ text, commentId }]，要点 + 回链
    Stale     bool      `gorm:"default:false"`
    CreatedAt time.Time `gorm:"autoCreateTime"`
    UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

// AiTask 异步 AI 任务（新增表）
type AiTask struct {
    ID        string    `gorm:"primaryKey;default:gen_random_uuid()"`
    Type      string                                        // summarize | rewrite | tag | profile | moderation
    TargetID  string
    Status    string    `gorm:"default:pending"`             // pending | running | done | failed
    Payload   datatypes.JSON `gorm:"type:jsonb"`
    Result    datatypes.JSON `gorm:"type:jsonb"`
    Retries   int       `gorm:"default:0"`
    CreatedAt time.Time `gorm:"autoCreateTime"`
    UpdatedAt time.Time `gorm:"autoUpdateTime"`
}
```

pgvector 列通过 `dal.Init` 中 raw SQL 创建（与现有 `initSearchIndexes` 同模式）：

```go
// 在 dal.Init 的 initSearchIndexes 中追加
statements = append(statements,
    "CREATE EXTENSION IF NOT EXISTS vector",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS embedding vector(1536)",
    "ALTER TABLE comments ADD COLUMN IF NOT EXISTS embedding vector(1536)",
    "CREATE INDEX IF NOT EXISTS idx_posts_embedding ON posts USING ivfflat (embedding vector_cosine_ops)",
    "CREATE INDEX IF NOT EXISTS idx_comments_embedding ON comments USING ivfflat (embedding vector_cosine_ops)",
)
```

## 6. 新增 API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | /ai/rewrite | Bearer | 润色 `{ content, style?, selection? }` → `{ result, diff }` |
| POST | /ai/suggest-title | Bearer | 标题建议 `{ content }` → `{ titles: string[] }` |
| POST | /ai/summarize-post | Bearer | 帖子摘要 `{ postId }` → `{ summary }` |
| POST | /ai/summarize-thread | Bearer | 讨论摘要 `{ postId }` → `{ points }` |
| POST | /ai/ask | Bearer | 追问 `{ postId?, question }` → `{ answer, citations[] }` |
| GET  | /profile/me | Bearer | 我的兴趣画像 |
| PATCH | /profile/me | Bearer | 编辑/清空画像 |
| GET  | /recommendations/feed | Bearer | 个性化推荐流（分页） |
| GET  | /posts/:id/related | 无 | 相关讨论 |

路由统一前缀 `/ai` 与 `/profile`、`/recommendations`，由 Go 后端（Hertz）的检索网关转发到 ai-service（Python，v2 新建）。

## 7. 架构与基础设施

### 7.1 AI 网关（ai-service 首个落地模块）

所有 LLM 调用收敛到 `packages/ai-service` 的统一网关：

- OpenAI 兼容接口适配（DeepSeek 当前，后续可切换）。
- 轻量/重量模型分流：标签、摘要、润色用轻量模型；追问、策展用重量模型。
- 限流、重试（指数退避）、缓存（Redis）、成本统计。
- 现有 Go 后端 `service.PostService.SuggestTags` 和 `service.PostSummaryService` 的 DeepSeek 直连逻辑收敛到网关模块，统一管理模型密钥与调用策略。

### 7.2 异步任务

- 发帖/新评论 → 触发向量化（embedding）与摘要任务，写入 `AiTask`，Redis 队列消费。
- 详情页 AI 内容首次请求返回占位状态，任务完成后前端轮询或 SSE 更新。

### 7.3 基础设施变更（services/docker-compose.yml）

- PostgreSQL 启用 pgvector 扩展（向量字段）。
- Redis 已有，新增队列用途。
- 不引入 Qdrant/Neo4j：v2 数据量下 pgvector 足够，Qdrant 与 Neo4j 留待 v3。

### 7.4 前端（L0 卡片对齐）

- 编辑器：工具栏 AI 润色入口、diff 面板、AI 标题建议下拉、AI 摘要生成。
- 阅读：讨论摘要卡（回链可点）、帖子摘要卡、追问输入框与问答卡、长文折叠。
- 发现：推荐流卡（含「为什么推荐」画像标签）、AI 策展区。
- 个人中心：兴趣画像面板（编辑/清空/关闭推荐）。
- 全部 AI 输出组件复用「AI 生成」标识样式与回链样式，统一设计 token。

## 8. 优先级与里程碑

| 里程碑 | 范围 | 交付目标 |
|---|---|---|
| M1 AI 创作 | F1 润色、F4 标签升级、F2 标题、F3 摘要、AI 网关 | 编辑器完成 AI 化，发布链路带 AI 辅助 |
| M2 AI 阅读 | F7 讨论摘要、F8 帖子摘要、F9 追问、F10 折叠、向量化底座 | 长讨论可导航，社区内容可问答 |
| M3 AI 发现 | F11 画像、F12 推荐、F13 策展、F14 相关、F15 语义搜索 | 首页个性化，发现页 AI 策展 |
| M4 AI 治理 | F18 预检、F19 审核、F17 通知摘要、F20 周报、F6 评论润色 | 治理提效，体验收尾 |

依赖顺序：M1 的 AI 网关是 M2/M3 的前置；M2 的向量化底座是 M3 推荐与语义搜索的前置。里程碑内功能可并行开发。

## 9. 验收标准

### 9.1 手动端到端（M1 完成时）

- 发帖页选中一段文字润色 → diff 可见 → 采纳后发布，帖子不带任何 AI 标识。
- 代码块不被润色改写；未登录用户无 AI 润色入口。
- 标签功能迁移后行为不变：AI 生成标签可用、可合并、≤ 5 个。

### 9.2 手动端到端（M2 完成时）

- 造一条 10+ 评论的帖子 → 详情页出现讨论摘要卡 → 点击要点跳转对应楼层。
- 详情页追问「帖子里有人提到 XX 吗」→ 回答带引用回链，跳转可用。
- 无相关内容的提问返回「未找到相关讨论」明确提示。

### 9.3 手动端到端（M3 完成时）

- 新账号浏览/点赞 3 个主题 → 24h 内个人中心出现画像 → 推荐流出现「为什么推荐」。
- 编辑画像标签 → 10 分钟内推荐流变化；清空画像 → 推荐理由消失。
- 搜索关键词命中语义相近内容（如搜「React 卡顿」能召回「前端性能优化」帖）。

### 9.4 非功能

- AI 网关限流生效：超限返回 429 与明确提示；标签/摘要等轻量任务 P95 < 5s。
- 摘要、向量化等异步任务不阻塞发帖/评论主流程。
- AI 输出 100% 带来源标识；追问回答 100% 带引用回链（无法回链则拒绝作答）。
- `pnpm --filter web typecheck` 无报错；`cd server-go && go build ./...` 无报错。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| LLM 成本失控 | 统一网关限流 + Redis 缓存 + 轻量模型分流 + 异步批量任务 |
| RAG 幻觉 | 强制引用回链；无结果拒绝作答；仅检索有效内容 |
| 生成延迟影响体验 | 流式返回；摘要/画像异步化；AI 内容与主流程解耦 |
| 社区冷启动（新用户无行为） | 冷启动用内容特征 embedding 推荐（架构已定方案），画像随行为积累 |
| 用户对「AI 生成」反感 | 创作侧（润色/标签/标题）不标识、AI 仅辅助、作者可完全不用；阅读侧 AI 内容（摘要/回答/策展）明确标识并回链 |
| AI 服务故障 | 网关降级：润色/摘要失败静默隐藏，不阻塞发帖与阅读 |
