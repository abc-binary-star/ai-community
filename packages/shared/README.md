# packages/shared — 共享类型与协议

跨语言、跨包共享的类型定义与协议，保证 L0/L1/L2/L3 数据契约一致。

## 职责

- 维护 TypeScript 共享类型（供 `web` / `server` 使用）
- 维护跨语言协议（Protobuf / OpenAPI schema），供 TS 与 Python 包对齐
- 文档化各层之间的数据契约

## 目录结构

```
shared/
├── types/        # TypeScript 类型定义（卡片、帖子、画像、检索结果等）
└── proto/        # 跨语言协议定义（gRPC/Protobuf 或 OpenAPI）
```

## 核心类型（规划）

- `Card`：卡片统一模型（攻略卡/摘要卡/兴趣卡/人物卡的判别联合）
- `Post` / `Thread` / `Reply`：社区内容模型
- `SearchResult`：检索结果（含引用回链）
- `UserProfile`：兴趣画像（NL 文本 + 标签 + embedding）
- `Recommendation`：推荐结果（含画像依据）

## 跨语言对齐

- TypeScript 侧：直接使用 `types/`
- Python 侧：用 Pydantic model 对齐 `proto/` 定义的 schema
- 协议变更需同步两端，并在 CI 中校验兼容性

## 对接

- 被 `web` / `server` 直接依赖（pnpm workspace）
- 被 Python 包通过 `proto/` 生成的 stub 依赖
