# packages/knowledge — 📚 知识沉淀

从碎片化讨论中自动提取 FAQ / 攻略 / 知识图谱，反哺 RAG 检索底座。

## 定位（L2）

社区知识「沉淀不出来」是根本痛点（AnswerOverflow 解决的就是这个问题）。本包负责把讨论精华自动结构化为可检索的知识资产。

## 技术参照

- **Neo4j GraphRAG**：从非结构化文本抽取图结构，构建知识图谱
- **Discourse AI**：帖子 embeddings + RAG 文件索引 + AI 摘要——论坛内嵌 RAG 的官方范本
- **AnswerOverflow**：把帮助频道内容索引到搜索引擎，让社区问答可被检索

## 子模块

```
knowledge/app/
├── extractor/     # LLM 实体抽取（从讨论帖提取实体/关系/要点）
└── graphrag/      # Neo4j GraphRAG（知识图谱构建与查询）
tests/
```

## 沉淀产物

- **FAQ 库**：高频问答自动归纳
- **攻略库**：讨论精华提取为结构化攻略
- **知识图谱**：实体关系图（Neo4j），支持图查询与 GraphRAG

## 反哺机制

沉淀的知识资产反哺 L1 `ai-service` 的 RAG 检索底座——检索时不仅召回原帖，还能召回已沉淀的结构化 FAQ/攻略，提升答案质量。

## 对接

- 输入：L3 `server` 的讨论帖与回复
- 存储：`services/neo4j`（图谱）+ `services/qdrant`（向量化沉淀物）
- 输出：供 L1 RAG 检索召回
