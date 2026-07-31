# packages/ai-service — ⚙️ AI 服务层

Agent 编排与 RAG 检索核心，对接 L2 画像/推荐/沉淀能力，产出结构化结果给 L0 包装为卡片。

## 定位（L1）

把社区历史内容变成「可检索、可问答、可策展」的智能能力层。是「智能攻略检索」场景的核心引擎。

## 技术栈

- Python 3.11+
- LangGraph：Agent 多步检索编排（Agentic RAG 首选）
- LlamaIndex：索引/查询引擎/Data Agent
- 向量库：Qdrant（主）/ pgvector（备）
- LLM：支持本地与云模型（OpenAI 兼容接口）

## 子模块

```
ai-service/app/
├── rag/         # RAG 检索（Perplexica 模式，含社区搜索模式）
├── agent/       # Agent 编排（LangGraph：检索→评估→重检索→生成）
├── curation/    # AI 策展（BestBlogs 模式：摘要/标签/卡片化）
└── summary/     # 长讨论自动折叠为要点
core/            # LLM 客户端、embedding、配置
tests/
```

## 检索范式（参考）

- **Perplexica**：开源 Perplexity 替代，含 Reddit Search Mode——「对社区历史对话做 AI 搜索」的现成范例
- **LangGraph**：检索→评估→重检索→生成循环，Agentic RAG 引擎层首选
- **AnswerOverflow**：把社区帮助频道内容索引到搜索引擎，社区 RAG 的数据底座

## 关键输出

所有 AI 输出必须包含：
- 📝 结构化要点（供 L0 包装为卡片）
- 🔗 引用回链（原帖 ID + 原作者，强制）
- 🏷️ 标签（供 L2 画像与推荐消费）

## 快速验证路径

调研建议先用 Dify/FastGPT 搭建 RAG 问答原型，验证检索效果后再迁移到 LangGraph + LlamaIndex。

## 对接

- 从 L3 `server` 读取社区内容与行为
- 向量写入 `services/qdrant`
- 调用 L2 `profile` / `recommendation` / `knowledge` 丰富结果
- 结果回传 L3 检索网关或直传 L0
