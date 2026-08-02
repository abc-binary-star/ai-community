# ADR-0001：初始四层架构与 Monorepo 拆分

- 状态：Accepted
- 日期：2026-07-31
- 决策者：基于调研报告结论

## 背景

调研报告（飞书文档 K6E8dIhA1o3vjsxXNLBc5p4UnHh）建议采用「社区底座 + AI 服务层 + 数据模型层 + 卡片交互层」的四层分离架构，并指出开源技术栈各层均有成熟方案，但存在两个整合缺口：社区场景特化、卡片 UI 层。

技术栈语言分布呈现结构性特征：社区底座/RAG 搜索相关开源项目（TailChat / Perplexica / AnswerOverflow）以 TypeScript 为主；Agent/画像/推荐/沉淀相关（LangGraph / RecBole / GenUP / Neo4j）以 Python 为主。

## 决策

1. **采用四层架构**：L0 卡片交互层 / L1 AI 服务层 / L2 数据模型层 / L3 社区底座，详见 [docs/design/architecture.md](../design/architecture.md)。
2. **Monorepo 三轨管理**：
   - TypeScript 包（web / shared）用 pnpm workspace
   - Go 后端（server-go）独立管理，Hertz + GORM
   - Python 包（ai-service / profile / recommendation / knowledge）用 pyproject.toml 独立管理
3. **跨语言协议**：Go 后端通过 REST/HTTP 网关对接 Python AI 服务层；前端共享类型在 `packages/shared`。
4. **基础设施本地化**：services/ 下用 docker-compose 编排 PostgreSQL+pgvector / Redis / Qdrant / Neo4j。

## 备选方案

- **方案 B：单语言全栈**（全 TS 或全 Python）。否决理由：复用开源资产时跨语言不可避免，强行单语言会放弃 TailChat/Perplexica 或 LangGraph/RecBole 其中一端的成熟方案。
- **方案 C：多仓库**。否决理由：早期整合频繁，跨仓库联动成本高；monorepo 更利于端到端联调。

## 后果

- 优点：各层可独立演进，最大化复用开源资产，缺口层（L0 卡片 UI）可聚焦自建。
- 风险：双语言增加构建/部署复杂度，需在 CI 中分别处理 pnpm 与 Python 工具链。
- 缓解：`packages/shared` 维护共享协议；CI 用 `.github/workflows` 分矩阵作业。
