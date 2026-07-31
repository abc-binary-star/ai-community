# 四层架构设计

> 本文档描述 AI Community 的分层架构、层间职责边界与数据流。架构源自调研报告「社区底座 + AI 服务层 + 数据模型层 + 卡片交互层」的四层分离建议。

## 1. 分层总览

```
┌──────────────────────────────────────────────────────────┐
│  L0  卡片交互层  packages/web                             │
│  攻略卡 / 摘要卡 / 兴趣卡 / 人物卡 · 引用回链 · 可追问    │
├──────────────────────────────────────────────────────────┤
│  L1  AI 服务层   packages/ai-service                      │
│  RAG 检索 · Agent 编排 · AI 策展 · 讨论摘要               │
├──────────────────────────────────────────────────────────┤
│  L2  数据模型层                                           │
│  · 兴趣画像 packages/profile          (GenUP 模式)        │
│  · 推荐引擎 packages/recommendation  (RecBole)           │
│  · 知识沉淀 packages/knowledge       (Neo4j GraphRAG)    │
├──────────────────────────────────────────────────────────┤
│  L3  社区底座    packages/server                          │
│  频道 / 帖子 / 成员 / 检索网关  (类 Discord, 参考 TailChat)│
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  基础设施  services/                                      │
│  PostgreSQL+pgvector · Redis · Qdrant · Neo4j            │
└──────────────────────────────────────────────────────────┘
```

开源项目在 L1、L2 高度密集，但 L0（卡片 UI）和 L3（社区交互重构）的专用方案稀缺——**L0 与 L3 的整合层是最大缺口，也是产品差异化切口**。

## 2. 各层职责

### L0 卡片交互层（packages/web）

**职责**：把 AI 输出包装为可消费的卡片体验，是端到端方案的核心自建环节。

**卡片类型**：
- 🗺️ **攻略卡**：结构化步骤，多步检索结果汇总
- 📋 **摘要卡**：讨论要点 + 原帖链接，支持追问展开
- 🎯 **兴趣卡**：基于画像推荐的相关内容
- 👤 **人物卡**：活跃同好推荐

**设计原则**：
- 🔗 引用回链：所有 AI 生成内容必须回链到原帖与原作者（Reddit Answers 范式）
- 💬 可追问：卡片支持「追问展开」，从摘要深入原始讨论
- 👁️ 画像透明：展示「为什么推荐这张卡片」背后的兴趣画像标签

**技术**：Next.js (App Router) + React + Tailwind + shadcn/ui。

### L1 AI 服务层（packages/ai-service）

**职责**：Agent 编排与 RAG 检索，对接 L2 的画像/推荐/沉淀能力，产出结构化结果给 L0 包装。

**子模块**：
- `rag/`：RAG 检索，Perplexica 模式（社区搜索模式）
- `agent/`：Agent 多步检索编排，LangGraph
- `curation/`：AI 策展，BestBlogs 模式（LLM 生成摘要/标签/卡片化）
- `summary/`：长讨论自动折叠为要点

**技术**：Python + LangGraph + LlamaIndex。可嵌入 Perplexica / Dify / FastGPT 做快速验证。

### L2 数据模型层

**职责**：用户行为 → 兴趣画像 → 推荐排序 → 知识沉淀。

| 子包 | 职责 | 技术参照 |
| --- | --- | --- |
| `packages/profile` | LLM 生成自然语言用户画像 | GenUP（NL profile）|
| `packages/recommendation` | 个性化内容排序、冷启动 | RecBole（94 种模型）|
| `packages/knowledge` | 讨论→FAQ/攻略/知识图谱 | Neo4j GraphRAG |

**冷启动**：新用户/新内容采用多模态 embedding 内容特征方案，降低对协同过滤历史的依赖。

### L3 社区底座（packages/server）

**职责**：频道/帖子/成员的核心模型与检索网关，类 Discord 结构。

**子模块**：
- `modules/channel/`：频道（类 Discord 频道）
- `modules/post/`：帖子（类贴吧帖子）
- `modules/member/`：成员
- `modules/search/`：检索网关，统一对接 L1 AI 服务与 L2 推荐

**技术**：Node.js + TypeScript。可参考 TailChat（类 Discord 开源）的频道/成员模型。

## 3. 数据流

### 智能攻略检索流

```
用户提问
  → L0 卡片交互层（输入框）
  → L3 检索网关
  → L1 Agent 编排（LangGraph：检索→评估→重检索→生成）
  → L1 RAG 检索（向量库召回社区历史内容）
  → L1 AI 策展（结构化为攻略要点 + 引用）
  → L0 攻略卡（带原帖回链，可追问）
```

### 兴趣卡片推荐流

```
用户行为（发帖/浏览）
  → L2 兴趣画像（GenUP 模式生成 NL profile）
  → L2 推荐引擎（RecBole 排序 + 冷启动 embedding）
  → L1 AI 策展（包装为卡片内容）
  → L0 兴趣卡流（画像透明，可调整）
```

### 知识沉淀流

```
讨论帖
  → L2 知识沉淀（实体抽取 + Neo4j GraphRAG）
  → 沉淀为可检索 FAQ / 攻略库 / 知识图谱
  → 反哺 L1 RAG 检索底座
```

## 4. 跨语言协作

- **TypeScript 包**（web / server / shared）通过 pnpm workspace 管理
- **Python 包**（ai-service / profile / recommendation / knowledge）通过各自 `pyproject.toml` 管理
- **跨语言协议**：`packages/shared/proto/` 维护 gRPC/Protobuf 定义，或通过 REST/HTTP 网关对接
- **共享类型**：`packages/shared/types/` 维护 TypeScript 类型，Python 侧用 Pydantic model 对齐

## 5. 设计红线（贯穿全层）

- 🔊 **真实人声优先**：AI 增强发现与沉淀，不替代人类生产内容；AI 生成内容须有标识
- 🔗 **引用回链**：AI 答案必须回链到原帖与原作者（L0 卡片强制）
- 👁️ **画像透明**：用户可查看和调整兴趣画像（L2 画像层 + L0 画像面板）

## 6. 参考

- 调研报告：`https://wcnu1dr3jdtn.feishu.cn/docx/K6E8dIhA1o3vjsxXNLBc5p4UnHh`
- 平台标杆：Reddit Answers（跨版块召回 + 综合摘要 + 引用回链）、Discourse AI（内嵌 RAG 全链路）
- 失败警示：Discord Clyde（AI 当成员已停用）、Stack Overflow（AI 回答反噬社区）
