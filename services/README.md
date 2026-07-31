# 本地基础设施

通过 docker-compose 编排社区所需的全部依赖服务。

## 服务清单

| 服务 | 镜像 | 端口 | 用途 |
| --- | --- | --- | --- |
| PostgreSQL + pgvector | `pgvector/pgvector:pg16` | 5432 | 主库 + 向量检索（社区数据、embedding）|
| Redis | `redis:7-alpine` | 6379 | 缓存 / 队列 / 会话 |
| Qdrant | `qdrant/qdrant` | 6333 / 6334 | 专用向量库（RAG 检索）|
| Neo4j | `neo4j:5-community` | 7474 / 7687 | 知识图谱（GraphRAG 沉淀）|

## 使用

```bash
# 在项目根目录
pnpm infra:up        # 启动全部服务
pnpm infra:down      # 停止

# 或在 services/ 目录
docker compose up -d
docker compose down
```

## 默认凭据（仅本地开发）

- PostgreSQL：`aicom / aicom_dev`，库 `aicom`
- Neo4j：`neo4j / aicom_dev`
- Redis / Qdrant：无认证（仅本地）

> ⚠️ 生产环境务必替换凭据并启用认证。

## 持久化

各服务数据持久化在对应子目录的 `./data/`（已在 `.gitignore` 忽略）。
