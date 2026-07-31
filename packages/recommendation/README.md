# packages/recommendation — ⚙️ 推荐引擎

个性化内容排序与冷启动，驱动「兴趣卡片推荐」场景。

## 定位（L2）

消费 L2 `profile` 的画像与 embedding，对社区内容排序，输出个性化卡片流。参考 RecBole 一站式推荐框架（94 种模型 + 65 个扩展）。

## 技术参照

- **RecBole**：开源推荐系统框架，覆盖 94 种模型，社区推荐后端的算法基座
- **小红书**：双瀑布流卡片 + CF/GNN 混合推荐 + 画像双向匹配——「卡片式兴趣推荐」最典型 UI + 机制参照
- **Pinterest**：Pin/Board 多模态图神经网络——兴趣图建模与瀑布流卡片 UI 的工程标杆
- **OpenBiliClaw**：本地可控 AI 内容发现 Agent——「用户掌控推荐逻辑」缓解信息茧房

## 子模块

```
recommendation/app/
├── ranker/        # RecBole 排序模型
└── cold_start/    # 冷启动：多模态 embedding 内容特征方案
tests/
```

## 信息茧房缓解（设计红线）

- 👁️ 画像透明：用户可审视推荐依据（与 `profile` 协同）
- ✏️ 用户可调整推荐逻辑（参考 OpenBiliClaw「用户掌控」）
- 🎲 保留跨领域发现与意外惊喜，不完全依赖兴趣匹配

## 输出

- 排序后的内容列表（带画像依据）
- 冷启动场景下的内容相似度匹配

## 对接

- 输入：`profile` 的画像/embedding + L3 `server` 的内容库
- 输出：供 L1 `ai-service` 策展包装为兴趣卡片，再经 L3 检索网关回传 L0
