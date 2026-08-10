# P6 文档编辑器端到端 Playbook

> 纯人工/脚本均可执行的端到端场景手册。不引新依赖。
> 覆盖：自动保存、草稿冲突、AI Diff 工作流、块 ID 锚点投影、slash 命令、mobile-toolbar 关键分支。

---

## 0. 前置准备

- 本地服务：`./dev.sh` 或分别 `pnpm --filter web dev`（端口 3000）+ 后端
- 两个浏览器账号：UserA / UserB，或者同一账号在 Normal + Incognito 窗口
- 测试帖：新建或找一篇已有帖子，记下 `POST_ID`

所有命令若未特殊说明，均在 `packages/web/` 目录执行。

```bash
cd packages/web
pnpm test           # 先跑单测，确保纯函数层绿
```

---

## 1. 自动保存（Autosave）

### 1.1 新建帖草稿 → 本地自动落盘

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| A1 | 登录 UserA → 进入 `/community/post/new` | 地址栏显示 `/community/post/new` |
| A2 | 标题填「P6 Autosave 测试」，正文写「第一行文本」，停手等 2 秒以上 | 右下角 SaveStatus：`idle → saving → saved`，最后保存时间变为「刚刚」 |
| A3 | **不提交**，直接关闭浏览器标签页（或 CMD+W） | 关闭前无 beforeunload 弹框（因为已 saved） |
| A4 | 重新打开 `/community/post/new` | 标题与正文自动回填「P6 Autosave 测试」+「第一行文本」；SaveStatus 显示「已恢复草稿」或上次保存时间 |
| A5 | 清理：进入草稿列表 `/community/drafts`，删除这条本地草稿 | 列表条目消失 |

### 1.2 刷新页面 → beforeunload 拦截

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| B1 | 重新进入新建页，快速输入标题「未保存测试」，**不等 autosave** 立刻点刷新（CMD+R） | 浏览器弹出「您有未保存的更改，确定要离开吗？」确认框 |
| B2 | 点「离开」→ 再回来新建页 | 内容为空（脏数据被丢弃是预期；若被保存则说明 debounce 过短） |

### 1.3 编辑已有帖自动保存

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| C1 | UserA 进入 `/community/post/[POST_ID]/edit` | 页面拉取服务器最新内容，SaveStatus 变为 `saved` |
| C2 | 在本地改标题为「UserA 本地版本」，但**不提交** | SaveStatus `idle → saving → saved` |
| C3 | 保持页面打开，跳到第 2 节继续（草稿冲突） | 本页不要关 |

### 1.4 断言脚本（可选，纯命令层）

```bash
# 验证 autosave-logic 状态机
node --import tsx --test lib/autosave-logic.test.ts 2>&1 | tail -20
# 预期：ok ### tests，0 failed
```

---

## 2. 草稿冲突（Conflict Detection）

### 2.1 两方同时编辑 → diverged 冲突

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| D1 | UserB（另一个浏览器/隐身窗口）进入同一篇 `/community/post/[POST_ID]/edit` | 载入服务器标题，非「UserA 本地版本」 |
| D2 | UserB 把标题改成「UserB 抢先提交版」，并点发布保存成功 | UserB 页面显示「发布成功」Toast |
| D3 | **切回 UserA 页面**，刷新或触发 `initialServerDraft` 重新拉取 | 检测到冲突，顶部或编辑器上方出现 **「草稿冲突」** Banner：有「保留我的版本」「采用服务器版本」两个按钮 |
| D4 | UserA 点「保留我的版本」→ 再发布 | 最终线上标题变为「UserA 本地版本」（本地优先） |

### 2.2 serverNewer → 静默接受服务器版本

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| E1 | 找一篇干净的帖子 POST_ID2，UserA 打开编辑页，**不改任何内容** | SaveStatus `saved` |
| E2 | UserB 打开 POST_ID2，修改标题为「B 的改法」，发布成功 | |
| E3 | UserA 过 5 秒刷新编辑页 | **不弹冲突 Banner**，标题自动变成「B 的改法」（serverNewer 但本地未改 = 无冲突，静默跟随） |

### 2.3 localNewer → 无冲突 Banner 且本地草稿保留

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| F1 | 找 POST_ID3，UserA 打开编辑页并把标题改了存为草稿（等 autosave saved） | |
| F2 | UserB 打开 POST_ID3 但**不做任何修改**就关掉页面 | |
| F3 | UserA 刷新编辑页 → 重新拉 `initialServerDraft`（updatedAt 不变或更早） | 无冲突 Banner，标题还是 UserA 草稿的改法（localNewer = 安全保留） |

### 2.4 断言脚本

```bash
node --import tsx --test lib/draft-storage.test.ts 2>&1 | grep -E "detectConflict|markSynced"
# 预期覆盖：缺少服务器时间 / 本地改+服务未改 / 双向 diverged / 数字型时间戳 等 8 条用例全过
```

---

## 3. AI Diff 工作流（润色 + 采纳/拒绝/换风格 + 恢复）

### 3.1 全文润色 → Diff 预览 → 采纳

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| G1 | 新建正文：「这个方案非常不好，我们可能要重来。」 | 光标在正文中 |
| G2 | 点「AI 润色」（工具栏 ✨ 按钮）或菜单选润色 | 请求中 → 出现 DiffPreview 组件 |
| G3 | DiffPreview 右栏：「不好」被红删除线划掉，「棒」被绿色下划线插入 | Stats 徽标显示 `+x -y`，原文/润色稿双栏对齐 |
| G4 | 点右上角「采纳」 | 正文立刻变成润色稿；Toast：「已采纳润色结果」+「可恢复原稿」按钮出现 |
| G5 | 点「恢复原稿」 | 正文还原为 G1 原文；历史栈弹出一条 |

### 3.2 选区润色 → 拒绝

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| H1 | 正文写：「这是前缀 ABC 这是后缀」，鼠标选中 `ABC` | |
| H2 | 润色，风格「friendly」 | DiffPreview 只比较选区 `ABC`；前缀、后缀不参与 diff |
| H3 | 点「放弃」 | 正文原样保留 `这是前缀 ABC 这是后缀`；候选被清空 |

### 3.3 换风格 → regenerate → 再接受

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| I1 | 正文「今天天气不错。」→ 润色 → 生成第一个 natural 风格 | Preview 出现 |
| I2 | 点下拉「换风格」→ 选择「formal」 | loading 徽标旋转 → 文案变为「正在用『正式书面』风格重新生成…」 |
| I3 | 新候选出来后点采纳 | 正文替换为 formal 润色结果 |

### 3.4 断言脚本

```bash
node --import tsx --test lib/text-diff.test.ts lib/ai-diff-workflow.test.ts 2>&1 | tail -30
# computeDiff / candidateDiffSegments / 工作流 8 个阶段全部通过
```

---

## 4. 块 ID 锚点投影

### 4.1 大纲 → 锚点 → 跳到正确块

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| J1 | 编辑器粘贴：<br>`# 引言`<br>`## 背景`<br>`### 子问题`<br>`## 方案` | 左侧 Outline 视图出现 4 条 |
| J2 | 点 Outline 中「子问题」 | 编辑器滚动到 `### 子问题` 段落并高亮；URL hash 变为 `#blk_xxx`（blk_ 前缀） |
| J3 | 刷新页面，hash 仍带上 `#blk_xxx` | 页面加载后自动滚到对应块 |

### 4.2 重写 Markdown → 锚点投影保留

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| K1 | 复制 J1 正文作为「旧版」，记下 `### 子问题` 的锚点 ID=OLD_ID | |
| K2 | 用 AI 全文润色（或手动改写部分段落）：把「背景」换成「相关工作」，顺序不变 | 新的大纲出现 4 条；投影结果应显示 `OLD_ID → 对应 level=3, text=子问题, order=2` 的新块 |
| K3 | 在页面上尝试访问旧 URL hash `#OLD_ID` | 不抛错，自动滚动到「子问题」新块（projectAnchorToOutline matchType=text/level/order） |

### 4.3 断言脚本

```bash
node --import tsx --test lib/block-id.test.ts lib/content-projection.test.ts lib/block-anchor-projection.test.ts 2>&1 | tail -30
```

---

## 5. Slash 命令（/ 斜杠快捷菜单）

### 5.1 基础打开 / 搜索 / 回车执行

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| L1 | 空行光标处敲 `/` | SlashMenu 弹出，显示全部 12 项；提示「输入斜杠命令，↑↓ 选择，Enter 确认」 |
| L2 | 继续敲 `h1` | 列表仅剩「一级标题」一项 |
| L3 | 敲回车 | `/h1` 被删除，当前段落变成 `<h1>` 块 |

### 5.2 组合键边界

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| M1 | 打开 `/` 菜单 → 按 `ArrowDown` 14 次（超过列表长度） | 高亮项循环回到顶部（wrapActiveIndex 取模正确） |
| M2 | 按 `ArrowUp` 1 次 | 高亮跳到列表末尾 |
| M3 | 按 `Escape` | 菜单关闭，光标保留；**不**删除 `/` 字符 |
| M4 | 重新打开菜单 → 按 `Tab` | 与 Enter 等效，执行当前高亮项 |

### 5.3 输入中文 → composition 不触发打开

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| N1 | 切换到中文输入法，敲拼音不选字，字符是 `/中文` 中间状态 | Slash 菜单保持关闭（isComposing=true 时跳过） |
| N2 | 选字上屏，文本最终为「标题」不含 `/` | 菜单仍关闭（detectSlashCommand.shouldOpen=false） |

### 5.4 搜索关键字分支

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| O1 | `/无序` → 列出「无序列表」 | 通过 keywords 匹配 `ul/list/无序` |
| O2 | `/代码块` → 列出「代码块」 | 通过 label/keywords 双命中 |
| O3 | `/xxx不存在` | 列表中显示「无匹配结果」占位 |

### 5.5 断言脚本

```bash
node --import tsx --test lib/slash-menu-logic.test.ts 2>&1
# 覆盖空 query、label/key/keyword 三命中、无匹配、中文输入法 composition、range 计算、上下循环边界
```

---

## 6. Mobile Toolbar（移动端工具栏）

> 需在 DevTools 切换到 iPhone/Android 尺寸（宽度 <768px），或真手机访问 `http://<局域网IP>:3000`。

### 6.1 主工具栏（未展开）+ 键盘弹出适配

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| P1 | 视口宽度设为 390（iPhone 12）→ 打开编辑器 | MobileToolbar 出现在屏幕底部；桌面 BubbleMenu 隐藏 |
| P2 | 光标落在正文 → 虚拟键盘弹起（visualViewport.height 缩小 > 120px） | Toolbar 位置抬升到键盘之上（keyboardHeight>0），不被键盘覆盖 |
| P3 | 收起键盘（点空白处）→ 500ms 后 | Toolbar 回落到屏幕底部（keyboardOpen=false） |

### 6.2 Active 状态与按钮联动

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| Q1 | 选中「粗体」按钮 → 选中一段文字点 B | B 按钮高亮（variant=secondary）；文字变粗 |
| Q2 | 光标放在刚加粗的文字中 | B 保持高亮；Italic/Strike 不高亮（isActionActive 按 mark 判断） |
| Q3 | 光标放在 H2 标题中 → 展开更多（点向下 Chevron） | H2 按钮高亮；bullet/ordered/todo 不亮 |
| Q4 | 点 `Undo` / `Redo` 按钮 | 空历史时按钮 disabled；执行过编辑后恢复可点 |

### 6.3 展开二级工具栏 + 斜杠入口

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| R1 | 点工具栏最右 ChevronDown 展开二级 | 出现 4x2 网格，含标题/无序/有序/待办/引用/代码块/链接/斜杠命令/正文 |
| R2 | 点「/命令」按钮 | 编辑器光标位置自动插入 `/` 并弹出 SlashMenu（onOpenMore 可选触发） |
| R3 | 二级工具栏 → 点「引用」 | 当前段落变为 `<blockquote>`；按钮高亮 |

### 6.4 链接分支（空值 / 回填 / 清除）

| 步骤 | 操作 | 预期观察点 |
| --- | --- | --- |
| S1 | 选中文本「官网」→ 展开二级 → 点链接 | prompt 弹出，默认值 `https://` |
| S2 | 输入 `https://example.com` 确定 | 文本加蓝带下划线；link mark 激活 |
| S3 | 光标再放上去 → 点链接 → prompt 出现当前 URL，点取消 | 链接保持不变 |
| S4 | 光标再放上去 → 点链接 → 删除 prompt 内容，直接确定 | 链接被清除（unsetLink 分支） |

### 6.5 断言脚本

```bash
node --import tsx --test lib/mobile-toolbar-logic.test.ts 2>&1
# 覆盖视口差键盘检测 / safeArea 兜底 / action active 11 种分支
```

---

## 7. 回归总览（冒烟清单）

跑完以上场景后，快速对照：

| 模块 | 关键信号 | OK |
| --- | --- | --- |
| Autosave | saveStatus 指示灯 `idle/saving/saved/error` 循环正确 | ▢ |
| Conflict | 三态 Banner 与 localNewer/serverNewer/diverged 三分支 | ▢ |
| AI Diff | 全文/选区两种 diff 范围；accept/reject/regenerate/restore | ▢ |
| Block Anchor | 旧锚点 → 润色后新块按 exact/text/level/order 四档映射 | ▢ |
| Slash | 打开/搜索/键盘/IME/无匹配/图片特殊分支 | ▢ |
| Mobile Toolbar | 键盘适配 / active 高亮 / 二级展开 / link prompt 三分支 | ▢ |

---

## 8. 纯命令行全量回归（CI 友好）

```bash
#!/bin/bash
# packages/web/ 下执行
set -e

echo "=== 1. 单测 ==="
pnpm test

echo "=== 2. 类型检查 ==="
pnpm typecheck

echo "=== 3. Lint（Next.js）==="
pnpm lint || echo "lint 非阻塞，继续"

echo "=== 全部完成 ==="
```

预期：

- `pnpm test` 至少命中：
  - `draft-storage.test.ts`
  - `autosave-logic.test.ts`
  - `text-diff.test.ts`
  - `ai-diff-workflow.test.ts`
  - `block-id.test.ts`
  - `content-projection.test.ts`
  - `block-anchor-projection.test.ts`
  - `slash-menu-logic.test.ts`
  - `mobile-toolbar-logic.test.ts`
- `pnpm typecheck` 0 Error
- `pnpm lint` 无新增 Error

---

## 9. 故障快速排查

| 症状 | 首查文件 | 相关纯函数 |
| --- | --- | --- |
| 自动保存灯一直停在 saving | `lib/use-draft-autosave.ts` / `autosave-logic.ts` | `flushAccumulated` / `concludeSave` / `transitionSaveStatus` |
| 冲突 Banner 总不弹 | `lib/draft-storage.ts` / `autosave-logic.ts` | `detectConflict` / `planConflictResolution` |
| AI Diff 全红全绿不对齐 | `lib/text-diff.ts` / `ai-diff-workflow.ts` | `computeDiff` / `candidateDiffSegments` / `computeDiffStats` |
| 锚点跳转落到错误段落 | `lib/block-anchor-projection.ts` | `projectAnchorToOutline` / `syncBlockAnchors` |
| Slash 输中文误弹菜单 | `lib/slash-menu-logic.ts` + 组件 isComposing | `detectSlashCommand` / `filterSlashItems` |
| 移动端工具栏被键盘遮住 | `lib/mobile-toolbar-logic.ts` | `detectVirtualKeyboard` / `parseSafeAreaBottom` |
