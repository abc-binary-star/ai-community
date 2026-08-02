# AI Community 生产部署指南（VPS + Docker）

本文档教你如何把 AI Community 部署到一台 Linux VPS 上，让别人通过公网链接访问。

## 架构图

```
用户浏览器
    │
    ▼
┌─────────────────────┐
│   Nginx (80/443)    │  ← 对外唯一入口
│   反向代理 + 静态缓存 │
└──────┬──────────────┘
       │
       ├── /api/*  ──────►  ┌─────────────────┐
       │                    │  后端 Go         │
       │                    │  (Hertz 3001)    │
       │                    │  GORM AutoMigrate│
       │                    └──────┬──────────┘
       │                           │
       │                    ┌──────┴──────┐
       │                    │ PostgreSQL  │
       │                    │ + pgvector  │
       │                    │  (5432)     │
       │                    └─────────────┘
       │
       └── 其他请求 ──────►  ┌─────────────────┐
                             │  前端 Next.js   │
                             │  (Node 3000)   │
                             └─────────────────┘
```

## 第一步：VPS 基础准备

### 1. 购买一台 VPS

推荐配置（最低要求）：
- CPU: 1 核
- 内存: 2 GB（推荐 4 GB，构建时更流畅）
- 硬盘: 20 GB SSD
- 系统: Ubuntu 22.04 LTS / Debian 12
- 带宽: 5 Mbps 以上

### 2. 开放防火墙端口

在云厂商控制台的"安全组"里开放：
- 80 (HTTP) - 必开
- 443 (HTTPS) - 配 SSL 时开
- 22 (SSH) - 默认已开

不需要开放 3000、3001、5432 端口。所有内部通信由 Docker 网络处理，只有 Nginx 的 80 端口暴露到公网。

### 3. 安装 Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo systemctl enable docker
sudo systemctl start docker
docker --version
docker compose version
```

## 第二步：上传项目到 VPS

```bash
# 方式 A：Git 拉取（推荐）
cd /opt
git clone https://github.com/你的用户名/ai-community.git
cd ai-community

# 方式 B：scp 上传
scp -r /Users/xqd_mac/codeing/ai-community root@你的服务器IP:/opt/
```

## 第三步：配置环境变量

```bash
cd /opt/ai-community
cp .env.production .env.production
nano .env.production
```

必须修改的值：

```
# JWT 密钥（必须更换）
# 生成命令: openssl rand -hex 32
JWT_SECRET=a1b2c3d4e5f6...

# CORS 域名
CORS_ORIGIN=http://你的服务器IP

# DeepSeek AI（标签推荐 / 讨论摘要，不配也能跑，AI 功能降级）
DEEPSEEK_API_KEY=sk-xxxxxxxx
```

## 第四步：一键部署

```bash
cd /opt/ai-community
bash deploy.sh
```

脚本会自动完成：
1. 检查 Docker 环境
2. 加载环境变量
3. 构建 Docker 镜像（Go 后端 + 前端）
4. 启动所有服务

Go 后端启动时通过 GORM AutoMigrate 自动建表，无需手动运行数据库迁移。默认频道数据也会自动初始化。

首次构建约 3-5 分钟。

## 第五步：验证

浏览器打开 `http://你的服务器IP`，应该能看到登录页面。

测试注册一个账号，登录后发帖、评论、点赞，全部正常即部署成功。

## 常用运维命令

```bash
cd /opt/ai-community

# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 查看日志（实时）
docker compose -f docker-compose.prod.yml logs -f

# 只看后端日志
docker compose -f docker-compose.prod.yml logs -f server

# 只看前端日志
docker compose -f docker-compose.prod.yml logs -f web

# 重启某个服务
docker compose -f docker-compose.prod.yml restart server

# 完全停止
docker compose -f docker-compose.prod.yml down

# 完全停止 + 删除数据库（会清空所有数据）
docker compose -f docker-compose.prod.yml down -v
```

## 更新应用代码

```bash
cd /opt/ai-community
git pull origin main
bash deploy.sh
```

## 本地开发

```bash
# 1. 启动基础设施（PostgreSQL + Redis）
cd services && docker compose up -d

# 2. 启动 Go 后端
cd server-go
cp .env.example .env  # 编辑数据库连接等
go run ./cmd/server

# 3. 启动前端
cd packages/web
cp .env.local.example .env.local
pnpm dev
```

## 故障排查

### 端口被占用

修改 `.env.production` 里的 `NGINX_PORT=8080`

### 后端连不上数据库

Go 后端启动时 GORM 连接 PostgreSQL，如果 postgres 还没就绪会自动重试。如果持续失败，重启即可：

```bash
docker compose -f docker-compose.prod.yml restart server
```

### CORS 报错

检查 `.env.production` 里的 `CORS_ORIGIN` 是否包含前端页面的域名。

### 容器构建时内存不够

VPS 内存不足导致 OOM Kill，添加 swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```
