# 性能优化与安全保障开发方案

> 基于 `ai-community` 仓库全量代码审计，覆盖 Go 后端（Hertz + GORM + PostgreSQL）与 Next.js 前端。

---

## 一、现状概览

| 维度 | 技术栈 |
|------|--------|
| 后端 | Go 1.26 + CloudWeGo Hertz + GORM + PostgreSQL 16 (pgvector) |
| 前端 | Next.js 14 App Router + TanStack Query + Zustand + Tailwind |
| 部署 | Docker Compose + Nginx 反向代理 |
| AI | DeepSeek API（标签推荐 / 讨论摘要） |

项目功能已覆盖：帖子 CRUD、评论嵌套、点赞收藏、关注屏蔽、私信、通知、搜索、举报审核、发现页、AI 标签 / 摘要。代码质量整体不错——批量查询消除 N+1、事务保证一致性、时序侧信道防御等均已做到位。以下是性能和安全两个方向的深度审计结果与开发方案。

---

## 二、性能优化方案

### P0 — 数据库连接池调优

**问题**：[dal/init.go](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/dal/init.go) 中 `gorm.Open` 未配置连接池参数，使用 pgx 默认值（最大连接数无上限）。高并发下会打满 PostgreSQL 的 `max_connections`。

**方案**：
```go
sqlDB, _ := DB.DB()
sqlDB.SetMaxOpenConns(25)      // 与 PG max_connections 匹配
sqlDB.SetMaxIdleConns(10)
sqlDB.SetConnMaxLifetime(5 * time.Minute)
sqlDB.SetConnMaxIdleTime(10 * time.Minute)
```

**影响范围**：`server-go/internal/dal/init.go`

---

### P0 — 引入 Redis 缓存层

**问题**：当前无任何缓存，所有读请求直达数据库。高频接口（帖子列表、热门标签、频道列表、发现页）每次都执行完整 SQL 查询。

**方案**：引入 Redis 作为多级缓存，缓存策略如下：

| 接口 | 缓存 Key | TTL | 失效策略 |
|------|----------|-----|----------|
| `GET /api/channels` | `channels:all` | 1h | 频道变更时主动删 |
| `GET /api/posts/tags/popular` | `tags:popular` | 10min | 定时刷新 |
| `GET /api/discover` | `discover:{userID}` | 5min | TTL 过期 |
| `GET /api/posts` (latest) | `posts:list:{channel}:{sort}:{page}:{size}` | 30s | 帖子创建/删除时按 channel 批量删 |
| `GET /api/posts/:id` | `post:detail:{id}` | 60s | 帖子更新/删除时主动删 |
| `GET /api/posts/:id/summary` | 已有 DB 缓存 | — | 新评论达阈值时失效 |

**新增文件**：
- `server-go/internal/cache/redis.go` — Redis 客户端初始化
- `server-go/internal/cache/keys.go` — 缓存 Key 命名规范

**影响范围**：`dal/init.go`、各 service 文件

---

### P0 — ListConversations N+1 查询消除

**问题**：[service/message.go#L69-L98](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/message.go) `ListConversations` 在循环中逐条调用 `conversationToDTO`，每次都查对端用户 + 未读数。10 条会话 = 20 次额外查询。

**方案**：批量查询对端用户 ID 列表 → 一次 `WHERE id IN ?` 拿全部用户 → 批量 `GROUP BY conversation_id` 统计未读数。

```go
// 收集所有对端 ID
otherIDs := make([]string, 0, len(rows))
for i := range rows {
    otherID := rows[i].UserBID
    if rows[i].UserBID == userID { otherID = rows[i].UserAID }
    otherIDs = append(otherIDs, otherID)
}
// 批量查用户
var users []model.User
dal.DB.Where("id IN ?", otherIDs).Select(...).Find(&users)
// 批量查未读
dal.DB.Model(&model.Message{}).
    Select("conversation_id, count(*)").
    Where("conversation_id IN ? AND sender_id <> ? AND read_at IS NULL", convIDs, userID).
    Group("conversation_id").Scan(&unreadRows)
```

**影响范围**：`server-go/internal/service/message.go`

---

### P1 — 热门排序改为数据库层计算

**问题**：[service/post.go#L184-L220](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post.go) sort=hot 时拉取 500 条帖子到内存，再用 Go 排序。数据量大时内存和 CPU 开销高。

**方案**：在 Post 表增加 `hot_score` 字段，由定时任务或写入时计算：

```sql
ALTER TABLE posts ADD COLUMN hot_score integer DEFAULT 0;
CREATE INDEX idx_posts_hot ON posts (is_pinned DESC, hot_score DESC, created_at DESC);
```

`hot_score = like_count * 2 + comment_count * 3`，在点赞 / 评论 / 取消时增量更新。查询时直接 `ORDER BY is_pinned DESC, hot_score DESC, created_at DESC` + `OFFSET/LIMIT`。

**影响范围**：`model/post.go`、`service/post.go`、`service/comment.go`（评论增删时更新帖子 hot_score）

---

### P1 — Discover 接口并行查询

**问题**：[service/discover.go#L21-L45](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/discover.go) 三个子查询（热门帖、趋势标签、推荐用户）串行执行。

**方案**：用 `errgroup` 并行执行三个子查询：

```go
g, gctx := errgroup.WithContext(ctx)
var hotPosts *types.Paginated[types.Post]
var tags []map[string]interface{}
var users []types.PublicUser
g.Go(func() error { /* hotPosts */ })
g.Go(func() error { /* tags */ })
g.Go(func() error { /* users */ })
if err := g.Wait(); err != nil { return nil, err }
```

**影响范围**：`server-go/internal/service/discover.go`

---

### P1 — 消除 ListPosts 中重复的 blockedIDList 调用

**问题**：[service/post.go#L126-L178](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post.go) `ListPosts` 中 `blockedIDList` 被调用了两次（count 查询和 find 查询各一次），且 WHERE 条件被重复构建。

**方案**：提取公共 where 构建器，blockedIDList 只查一次：

```go
blocked := blockedIDList(ctx, userID)
baseWhere := func(q *gorm.DB) *gorm.DB {
    if len(blocked) > 0 {
        q = q.Where("author_id NOT IN ?", blocked)
    }
    if q != "" {
        like := "%" + q + "%"
        q = q.Where("title ILIKE ? OR content ILIKE ?", like, like)
    } else if channel != "" && channel != "all" {
        q = q.Where("channel = ?", channel)
    }
    // ... tag
    return q
}
```

**影响范围**：`server-go/internal/service/post.go`

---

### P1 — AI 接口异步化

**问题**：[service/post.go#L534-L636](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post.go) `SuggestTags` 同步等待 DeepSeek API（30s 超时），[service/post_summary.go](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post_summary.go) `GetSummary` 同步等待（60s 超时）。长时间阻塞 HTTP 连接。

**方案**：
- `SuggestTags`：前端发起后，后端立即返回 job_id，后台 goroutine 调用 AI，前端轮询结果。
- `GetSummary`：首次请求触发后台生成，返回 `eligible: true, summary: ""` + `generating: true`，前端轮询直到有结果。

**影响范围**：`service/post.go`、`service/post_summary.go`、对应 handler

---

### P2 — PostSummary 缓存失效机制

**问题**：[service/post_summary.go#L52-L54](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post_summary.go) 摘要一旦生成就永久缓存，新评论不会触发重新生成。

**方案**：在 `PostSummary` 表增加 `comment_count` 字段（已有），当当前评论数超过缓存时的评论数 + 阈值（如 20 条）时，标记需要重新生成并异步触发。

**影响范围**：`service/post_summary.go`、`service/comment.go`（评论创建时检查是否需要刷新摘要）

---

### P2 — 前端 SSR 优化

**问题**：大部分页面是 `'use client'` 组件，首屏需要先加载 JS 再请求数据，FCP 和 LCP 偏高。

**方案**：
- 帖子列表页、帖子详情页、用户主页改为 Server Component，首屏数据在服务端获取。
- 保持交互部分（点赞、评论输入）为 Client Component 嵌入。
- 利用 Next.js 的 `generateMetadata` 优化 SEO。

**影响范围**：`packages/web/app/community/` 下页面组件

---

### P2 — GORM 查询性能微调

**问题**：多处 `Preload("Author")` 会 SELECT 所有列，包括不需要的 `password`（虽然 json:"-" 不序列化，但 DB 层面仍会查询）。

**方案**：为 Preload 指定 Select 只查必要列：
```go
Preload("Author", func(db *gorm.DB) *gorm.DB {
    return db.Select("id", "username", "avatar", "display_name")
})
```

**影响范围**：各 service 文件中的 Preload 调用

---

## 三、安全保障方案

### S0 — 接口限流（Rate Limiting）

**问题**：所有接口无任何限流，登录/注册接口可被暴力破解，写接口可被滥用。

**方案**：实现基于 Redis 的滑动窗口限流中间件：

| 接口分组 | 限流策略 |
|----------|----------|
| `/api/auth/login`、`/api/auth/register` | 5 次/分钟/IP + 10 次/小时/邮箱 |
| `/api/posts` (POST)、`/api/comments` (POST) | 20 次/分钟/用户 |
| `/api/posts/:id/like`、`/api/comments/:id/like` | 30 次/分钟/用户 |
| `/api/messages/conversations/:id/messages` (POST) | 30 次/分钟/用户 |
| 其他读接口 | 100 次/分钟/IP |

**新增文件**：
- `server-go/internal/middleware/ratelimit.go` — 限流中间件
- `server-go/internal/cache/redis.go` — Redis 客户端（与缓存共用）

**影响范围**：`router/router.go`（挂载中间件）

---

### S0 — 安全响应头

**问题**：Nginx 和后端均未设置安全头：`X-Content-Type-Options`、`X-Frame-Options`、`Content-Security-Policy`、`Strict-Transport-Security`、`Referrer-Policy`。

**方案**：

1. 后端添加安全头中间件：
```go
func SecurityHeaders() app.HandlerFunc {
    return func(ctx context.Context, c *app.RequestContext) {
        c.Header("X-Content-Type-Options", "nosniff")
        c.Header("X-Frame-Options", "DENY")
        c.Header("X-XSS-Protection", "1; mode=block")
        c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
        c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'")
        c.Next(ctx)
    }
}
```

2. Nginx 启用 HTTPS + HSTS：
```nginx
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

**影响范围**：`router/router.go`、`nginx.conf`

---

### S0 — JWT Token 存储安全改造

**问题**：[lib/store.ts](file:///Users/xqd_mac/codeing/ai-community-worktree2/packages/web/lib/store.ts) 将 token 存储在 `localStorage`，XSS 攻击可窃取 token。

**方案**：将 access token 和 refresh token 改为 httpOnly + Secure + SameSite=Strict cookie：

1. 后端登录/注册接口设置 Cookie：
```go
c.SetCookie("access_token", token, 15*60, "/", "", true, true)
c.SetCookie("refresh_token", refreshToken, 7*24*3600, "/", "", true, true)
```

2. 后端 Auth 中间件从 Cookie 读取 token（兼容 Authorization Header 降级）。

3. 前端移除 localStorage 存储，`apiFetch` 不再手动设置 Authorization 头，改为 `credentials: 'include'`。

4. CORS 配置 `AllowCredentials: true`（已有）+ 明确 Origin（已有）。

**影响范围**：`middleware/auth.go`、`handler/auth.go`、`lib/store.ts`、`lib/api.ts`

---

### S0 — 密码强度策略强化

**问题**：[types/types.go](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/types/types.go) 注册仅要求密码 6-64 字符，无复杂度要求。

**方案**：增加密码强度校验规则：
- 至少 8 个字符
- 至少包含字母和数字
- 禁止纯数字 / 纯字母

```go
type RegisterReq struct {
    Password string `json:"password" vd:"len($)>=8 && len($)<=64"`
}
```
在 service 层增加复杂度校验函数。

**影响范围**：`types/types.go`、`service/auth.go`

---

### S0 — 登录失败锁定

**问题**：[service/auth.go](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/auth.go) 登录失败无计数和锁定机制，可被暴力破解。

**方案**：基于 Redis 记录连续失败次数：
- 连续失败 5 次 → 锁定该账号 15 分钟
- 连续失败 10 次 → 锁定 1 小时
- 同一 IP 失败 20 次/小时 → 封禁该 IP 1 小时

```go
key := fmt.Sprintf("login_fail:%s", email)
count, _ := redis.Incr(key).Result()
if count == 1 { redis.Expire(key, time.Hour) }
if count >= 5 {
    lockKey := fmt.Sprintf("login_lock:%s", email)
    redis.Set(lockKey, 1, 15*time.Minute)
}
```

**影响范围**：`service/auth.go`

---

### S1 — 服务端 Markdown / HTML 输入净化

**问题**：后端对帖子/评论内容不做净化，依赖前端 [rehype-sanitize](file:///Users/xqd_mac/codeing/ai-community-worktree2/packages/web/components/markdown-renderer.tsx) 防 XSS。若通过 API 直接提交恶意 HTML，其他客户端渲染时会中招。

**方案**：在后端写入前增加内容净化：
- 使用 `bluemonday` 库（Go HTML sanitizer）对内容进行净化
- 配置策略：允许 Markdown 常见标签（p, a, code, pre, img, table 等），移除 script/iframe/onerror 等

```go
import "github.com/microcosm-cc/bluemonday"
var p = bluemonday.UGCPolicy() // 允许用户生成内容的安全子集
content = p.Sanitize(content)
```

**新增依赖**：`github.com/microcosm-cc/bluemonday`

**影响范围**：`service/post.go`（CreatePost/UpdatePost）、`service/comment.go`（CreateComment/UpdateComment）

---

### S1 — JWT Token 吊销机制

**问题**：JWT 签发后无法主动失效。用户登出 / 修改密码 / 被封禁后，旧 token 在过期前仍然有效。

**方案**：基于 Redis 的 token 黑名单：
- 登出时将 access token 的 `jti`（需在 Claims 中增加）加入黑名单，TTL 为 token 剩余有效期
- Auth 中间件校验时检查黑名单
- 修改密码 / 封禁用户时，将该用户所有 token 的 `jti` 加入黑名单

```go
// Claims 增加 JTI
type Claims struct {
    JTI      string `json:"jti"`
    // ...
}

// 登出
jti := claims.JTI
redis.Set(fmt.Sprintf("jwt_blacklist:%s", jti), 1, time.Until(claims.ExpiresAt.Time))

// Auth 中间件
if exists, _ := redis.Exists(fmt.Sprintf("jwt_blacklist:%s", claims.JTI)).Result(); exists > 0 {
    response.Unauthorized(c, "登录已失效")
    return
}
```

**影响范围**：`pkg/jwt/jwt.go`、`middleware/auth.go`、新增 `handler/logout.go`

---

### S1 — 请求体大小限制

**问题**：Hertz 默认无请求体大小限制，恶意用户可发送超大请求体耗尽内存。

**方案**：添加请求体大小限制中间件：
```go
func MaxBodySize(maxBytes int) app.HandlerFunc {
    return func(ctx context.Context, c *app.RequestContext) {
        if len(c.Request.Body()) > maxBytes {
            response.BadRequest(c, "请求体过大")
            c.Abort()
            return
        }
        c.Next(ctx)
    }
}
```

全局限制 1MB，帖子创建接口限制 100KB。

**影响范围**：`router/router.go`

---

### S1 — Avatar URL SSRF 防护

**问题**：[service/user.go#L173-L178](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/user.go) `UpdateUser` 接受任意 URL 作为头像，可被用于 SSRF（如 `http://169.254.169.254/...` 探测内网）。

**方案**：
- 限制 avatar URL 的 scheme 为 `https`
- 校验 host 不为内网 IP / localhost
- 或改为上传到对象存储（OSS / S3），后端代理生成 URL

**影响范围**：`service/user.go`

---

### S1 — AI 服务错误信息脱敏

**问题**：[service/post.go#L602-L604](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post.go) 和 [service/post_summary.go#L171-L173](file:///Users/xqd_mac/codeing/ai-community-worktree2/server-go/internal/service/post_summary.go) 将 DeepSeek API 的完整响应体作为错误信息返回给客户端，可能泄露 API Key 或内部错误细节。

**方案**：
```go
if resp.StatusCode != 200 {
    body, _ := io.ReadAll(resp.Body)
    log.Printf("AI 服务请求失败 (%d): %s", resp.StatusCode, string(body))
    return nil, fmt.Errorf("AI 服务暂时不可用，请稍后重试")
}
```

**影响范围**：`service/post.go`、`service/post_summary.go`

---

### S2 — 审计日志

**问题**：管理员操作（角色变更、帖子置顶/下架、举报处理）无日志记录，出问题无法追溯。

**方案**：增加审计日志表和中间件：

```go
type AuditLog struct {
    ID        string    `gorm:"primaryKey"`
    ActorID   string    `gorm:"index;not null"`
    Action    string    `gorm:"not null"` // role_change, post_pin, report_handle, etc.
    Target    string
    Detail    string    `gorm:"type:text"`
    IP        string
    CreatedAt time.Time `gorm:"index"`
}
```

在 admin 接口的 handler 中记录操作。

**新增文件**：`model/audit_log.go`、`middleware/audit.go`

**影响范围**：`handler/post.go`、`handler/misc.go`、`handler/report.go`

---

### S2 — 结构化日志

**问题**：全项目使用 `log.Printf`，无结构化日志、无请求 ID 关联、无日志级别控制。

**方案**：引入 `zap` 或 `slog`（Go 1.21+）：
- 请求中间件生成 trace ID，注入 context
- 所有日志携带 trace ID、请求路径、用户 ID
- 生产环境 JSON 格式，开发环境 console 格式

**影响范围**：全后端（渐进式替换）

---

### S2 — 数据库索引补全

**问题**：部分高频查询缺少索引：

| 查询场景 | 当前索引 | 需补充 |
|----------|----------|--------|
| 评论按 post_id + parent_id 查询 | post_id 有索引 | 复合索引 `(post_id, parent_id, created_at)` |
| 通知按 user_id + read 查询 | user_id 有索引 | 复合索引 `(user_id, read, created_at)` |
| 帖子按 channel + created_at 排序 | channel 有索引 | 复合索引 `(channel, is_pinned, created_at)` |
| 消息按 conversation_id + created_at | conversation_id 有索引 | 复合索引 `(conversation_id, created_at, id)` |

**方案**：在 `dal/init.go` 的 `initSearchIndexes` 中补充 `CREATE INDEX IF NOT EXISTS` 语句。

**影响范围**：`dal/init.go`

---

## 四、优先级与实施排期

> 原则：**不需要引入新中间件/新依赖、改动小且明确的任务优先级高**；需要引入新 Hertz 中间件、新 Redis 基础设施、新第三方库或需要架构级改造的任务优先级排低。

### 第一梯队：纯代码修改，无需引入新中间件（优先实施）

这些任务只改现有文件的业务逻辑，不引入任何新依赖、新中间件或新基础设施，风险低、见效快。

| 序号 | 任务 | 类型 | 改动文件 | 说明 |
|------|------|------|----------|------|
| 1 | 数据库连接池调优 | 性能 | `dal/init.go` | 加 4 行 SetMaxOpenConns 等 |
| 2 | 数据库索引补全 | 性能 | `dal/init.go` | 补 4 条 CREATE INDEX 语句 |
| 3 | ListConversations N+1 消除 | 性能 | `service/message.go` | 改为批量查询对端用户+未读数 |
| 4 | Discover 并行查询 | 性能 | `service/discover.go` | errgroup 并行（Go 标准库） |
| 5 | blockedIDList 重复调用消除 | 性能 | `service/post.go` | 提取公共 where 构建器，只查一次 |
| 6 | GORM Preload 精简 Select | 性能 | 各 service | Preload 加 Select 只查必要列 |
| 7 | AI 错误信息脱敏 | 安全 | `service/post.go`、`post_summary.go` | 错误只返回通用提示，详情记日志 |
| 8 | Avatar URL SSRF 防护 | 安全 | `service/user.go` | 校验 scheme=https + 排除内网 IP |
| 9 | 密码强度策略强化 | 安全 | `types/types.go`、`service/auth.go` | 增加复杂度校验函数 |
| 10 | PostSummary 缓存失效 | 性能 | `service/post_summary.go`、`service/comment.go` | 评论增量达阈值时标记需重新生成 |

### 第二梯队：需要引入新中间件/新依赖/新基础设施（排后实施）

这些任务需要引入 Redis、新 Go 库、新 Hertz 中间件，或需要前后端协同改造，风险和复杂度较高。

| 序号 | 任务 | 类型 | 需引入的组件 | 说明 |
|------|------|------|-------------|------|
| 11 | Redis 缓存层 | 性能 | Redis + `go-redis/v9` | 新增 cache 包，改造各 service |
| 12 | 接口限流 | 安全 | Redis + 新中间件 `ratelimit.go` | 滑动窗口限流 |
| 13 | 安全响应头 + HTTPS | 安全 | 新中间件 `SecurityHeaders` | + Nginx SSL 配置 |
| 14 | JWT Cookie 存储改造 | 安全 | 改造 `auth` 中间件 + 前端 `lib/` | localStorage -> httpOnly Cookie |
| 15 | 登录失败锁定 | 安全 | Redis | 失败计数 + 账号/IP 锁定 |
| 16 | 服务端输入净化 | 安全 | 新依赖 `bluemonday` | 写入前 HTML sanitize |
| 17 | JWT Token 吊销 | 安全 | Redis + 改造 `auth` 中间件 + `jwt.go` | jti 黑名单 |
| 18 | 请求体大小限制 | 安全 | 新中间件 `MaxBodySize` | 全局 1MB，写接口 100KB |
| 19 | 审计日志 | 安全 | 新中间件 `audit.go` + 新 model | 记录管理员操作 |
| 20 | 结构化日志 | 安全 | 新依赖 `zap`/`slog` + 全局替换 | trace ID + JSON 日志 |
| 21 | AI 接口异步化 | 性能 | job 机制改造 | 同步阻塞 -> 异步轮询 |
| 22 | 热门排序数据库化 | 性能 | 新字段 `hot_score` + 回填脚本 | migration + service 改造 |
| 23 | 前端 SSR 优化 | 性能 | 前端架构改造 | Client -> Server Component |

---

## 五、新增依赖清单

### Go 后端

| 依赖 | 用途 |
|------|------|
| `github.com/redis/go-redis/v9` | Redis 客户端（缓存 + 限流 + token 黑名单） |
| `github.com/microcosm-cc/bluemonday` | HTML 净化（防 XSS） |
| `go.uber.org/zap` 或 `log/slog` | 结构化日志 |

### 基础设施

| 组件 | 用途 |
|------|------|
| Redis 容器 | 缓存 / 限流 / token 黑名单 / 登录锁定 |

`docker-compose.prod.yml` 新增 Redis 服务：

```yaml
redis:
  image: redis:7-alpine
  container_name: ai-community-redis
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 5
  restart: unless-stopped
```

---

## 六、风险与注意事项

1. **JWT Cookie 迁移兼容性**：改为 Cookie 存储后，已登录用户的 localStorage token 将失效，需要一次强制重新登录。建议在低峰期上线。

2. **Redis 引入的运维成本**：需要监控 Redis 内存和可用性，缓存雪崩时需有降级策略（缓存不可用时直接查库）。

3. **热门排序 hot_score 迁移**：需要一次性回填历史数据的 hot_score，建议在上线时执行 `UPDATE posts SET hot_score = like_count * 2 + (SELECT count(*) FROM comments WHERE comments.post_id = posts.id) * 3`。

4. **限流对测试的影响**：开发和测试环境需要放宽或关闭限流，通过环境变量控制。

5. **服务端内容净化**：`bluemonday` 需要仔细配置白名单，避免误杀合法的 Markdown 渲染结果。需与前端 `rehype-sanitize` 的策略保持一致。
