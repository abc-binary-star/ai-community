# packages/web — 🎴 卡片交互层

AI Community 的前端，负责把 AI 输出包装为可消费的卡片体验。**这是调研报告指出的最大缺口，也是产品差异化核心**。

## 定位（L0）

开源界有检索引擎和推荐算法，但缺「社区答案卡片/兴趣卡片」的专用前端组件——本包负责自建端到端卡片 UI。

## 技术栈

- Next.js (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui（通用底座）
- 状态管理：Zustand
- 数据获取：TanStack Query

## 卡片类型（核心自建组件）

| 卡片 | 用途 | 数据来源 |
| --- | --- | --- |
| 🗺️ 攻略卡 | 结构化步骤汇总 | L1 RAG + Agent 检索结果 |
| 📋 摘要卡 | 讨论要点 + 原帖链接 | L1 AI 策展 |
| 🎯 兴趣卡 | 基于画像推荐内容 | L2 推荐引擎 |
| 👤 人物卡 | 活跃同好推荐 | L2 画像 + 推荐 |

## 设计原则（红线）

- 🔗 **引用回链**：所有 AI 生成内容必须回链原帖与原作者
- 💬 **可追问**：卡片支持追问展开，从摘要深入原始讨论
- 👁️ **画像透明**：展示「为什么推荐这张卡片」背后的画像标签

## 目录结构

```
web/
├── app/
│   ├── (community)/     # 频道/帖子浏览
│   ├── (cards)/         # 兴趣卡片流
│   └── (search)/        # 智能检索（攻略卡入口）
├── components/
│   ├── cards/           # 卡片组件库（核心自建）
│   │   ├── guide-card.tsx
│   │   ├── summary-card.tsx
│   │   ├── interest-card.tsx
│   │   └── person-card.tsx
│   ├── community/       # 社区交互组件
│   └── ui/              # shadcn 基础组件
├── lib/                 # 工具与 API 客户端
├── hooks/
├── store/               # Zustand store
└── types/
```

## 对接

- 调用 `packages/server` 的社区数据 API
- 调用 `packages/ai-service` 的 RAG/策展 API（通过 server 网关或直连）
- 类型从 `packages/shared` 导入
