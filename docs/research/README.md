# 调研索引

## 核心调研报告

**《用 AI 与智能体重构兴趣社区范式调研报告》**
飞书文档：https://wcnu1dr3jdtn.feishu.cn/docx/K6E8dIhA1o3vjsxXNLBc5p4UnHh

- 调研日期：2026-07-31
- 覆盖项目：30+
- 来源数：44

## 报告章节

1. 摘要与核心发现
2. 概念定位：AI 作为基础设施层
3. 四大重构场景与技术栈全景
4. 智能内容检索：RAG + Agent
5. 兴趣画像与卡片式推荐
6. 平台自重构案例
7. 批判性视角与风险
8. 可复用开源技术栈
9. 产品设计建议
10. 结论

## 核心结论

- ✅ 方向被验证：Reddit Answers / Discourse AI / 知乎直答已在用 AI 重做社区检索与沉淀
- ❌ 「AI 当成员」路线受挫：Discord Clyde 已停用、Stack Overflow 衰落
- 🧩 开源技术栈各层就绪，但缺整合者
- ⚠️ 卡片式推荐 UI 是最大缺口 = 最大差异化机会

## 关键开源项目速查

| 层级 | 项目 | 用途 |
| --- | --- | --- |
| 社区底座 | TailChat | 类 Discord 频道/成员模型 |
| 内容索引 | AnswerOverflow | 社区内容结构化索引 |
| RAG 检索 | Perplexica | 类 Perplexity 社区搜索（含 Reddit Mode）|
| RAG 平台 | Dify / FastGPT / RAGFlow | 快速搭建 RAG 原型 |
| Agent 编排 | LangGraph | 多智能体工作流（Agentic RAG 首选）|
| 数据框架 | LlamaIndex | 索引/查询引擎/Data Agent |
| 兴趣画像 | GenUP | LLM 生成自然语言用户画像 |
| 推荐引擎 | RecBole | 94 种推荐模型一站式框架 |
| AI 策展 | BestBlogs | LLM 摘要/标签/卡片化 |
| 知识沉淀 | Neo4j GraphRAG | 讨论→知识图谱抽取 |

## 平台 AI 重构对标

| 平台 | AI 重构环节 | 状态 |
| --- | --- | --- |
| Reddit Answers | 发现 + 沉淀（跨版块召回 + 摘要 + 回链）| ✅ 已上线六语 |
| Discourse AI | 检索 + 摘要 + 分类（内嵌 RAG）| ✅ 并入核心 |
| 知乎直答 | 检索 + 溯源（DeepSeek-R1）| ✅ 已上线 |
| Discord Clyde | 互动（AI 当成员）| ❌ 已停用 |
| Meta Forum "Ask" | 分发（跨社区聚合）| 🆕 2025 推出 |

> 完整引用源见飞书文档第 11 节「📚 引用源」。
