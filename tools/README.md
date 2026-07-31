# 工具脚本

## 目录

- `scripts/`：数据导入、索引构建、向量化等运维脚本
- `seed/`：种子数据（示例频道/帖子，用于本地开发与演示）

## 规划中的脚本

- `scripts/seed_community.py`：灌入示例社区数据
- `scripts/build_index.py`：构建社区内容向量索引（写入 Qdrant / pgvector）
- `scripts/sync_to_neo4j.py`：把讨论实体抽取结果同步到 Neo4j
- `scripts/refresh_profile.py`：批量刷新用户兴趣画像
