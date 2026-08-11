# apps — 应用与服务分区

可独立运行的子服务集合。与 `packages/`（可复用库/前端包）、`tools/`（运维脚本）区分：

| 目录 | 内容 | 示例 |
|------|------|------|
| `apps/` | 面向用户可独立运行的服务（应用） | `epub-translator`（实用工具首个子服务） |
| `packages/` | 可复用库 / 前端子包 | `web`、`ai-service` |
| `tools/` | 运维脚本 / 数据脚本 | `scripts/`、`seed/` |

## 实用工具分区（独立个人应用）

面向个人用户的独立实用工具集合。每个工具是**自包含的独立应用**（独立 Go Module + 自带 Web 界面），可单独启动使用；社区前端（`packages/web`）通过 `/community/tools` 提供统一入口（iframe 嵌入）。**工具本身不做社区协作/分享功能。**

| 子服务 | 说明 | 技术栈 | 状态 |
|--------|------|--------|------|
| [epub-translator](./epub-translator/) | EPUB 书籍翻译：上传外文 EPUB，AI Agent 分章解析、保持版式，输出简体中文版 | Go + CloudWeGo Hertz + Eino + 豆包 ARK | ✅ 已迁移（首个） |
| _下一个工具占位_ | 待定（如 PDF 翻译 / 字幕翻译 / 格式转换） | - | ⏳ 规划中 |

### 入口

| 入口 | 地址 |
|------|------|
| 独立应用（直接访问） | `http://localhost:8888/` |
| 社区前端入口（iframe 嵌入） | `http://localhost:3000/community/tools` |

工具地址可用环境变量 `NEXT_PUBLIC_EPUB_TRANSLATOR_URL` 覆盖（社区前端读取）。

## 目录约定

```
apps/
└── <service-name>/              # 每个子服务一个独立目录
    ├── cmd/server/main.go       # 服务入口
    ├── internal/                # 业务代码
    ├── web/                     # 自带 Web 界面（静态资源）
    ├── configs/config.yaml      # 配置模板
    ├── go.mod                   # 独立 Go Module（github.com/abc-binary-star/ai-community/apps/<name>）
    └── docs/                    # 产品/设计文档
```

## 通用约定

- 每个子服务保持**独立运行、独立部署**，不依赖社区 server-go 的内部包，避免耦合
- Go Module 命名遵循 `github.com/abc-binary-star/ai-community/apps/<service-name>`
- Web 界面样式遵循 [Commons · Marginalia 主题](../packages/web/app/globals.css) 设计语言
- 子服务产生的运行时数据（上传/输出/数据库）写入 `storage/`，不纳入版本控制
- 流水线/产品设计文档沉淀到 [docs/design](../docs/design/) 统一管理
