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

推荐用 Git 方式。虽然前后端代码由镜像分发、服务器不编译代码，但 `nginx.conf`、
`docker-compose.prod.yml`、`deploy.sh` 是**服务器本地文件**，只有 git 仓库才能随
CI 自动更新（自动部署会执行 `git pull`）。用 scp 上传则每次改这些文件都要手动重传。

```bash
# 方式 A：Git 拉取（推荐）
cd /opt
git clone https://github.com/你的用户名/ai-community.git
cd ai-community

# 方式 B：scp 上传（配置文件变更需每次手动重传）
scp -r /Users/xqd_mac/codeing/ai-community root@你的服务器IP:/opt/
```

### 已用 scp 部署，如何转成 Git 仓库

在服务器项目目录下原地初始化即可，不会影响正在运行的容器，也不会动 `.env` 和数据库卷：

```bash
cd /opt/ai-community
git init
git remote add origin https://github.com/你的用户名/ai-community.git
git fetch origin main
# 用远端版本覆盖本地被跟踪文件；.env 已在 .gitignore 中，不受影响
git reset --hard origin/main
git branch --set-upstream-to=origin/main main 2>/dev/null || git checkout -B main origin/main
```

`git reset --hard` 会丢弃对**被 git 跟踪文件**的本地修改。若你在服务器上手改过
`nginx.conf` 或 `docker-compose.prod.yml`，先备份：

```bash
cp nginx.conf /tmp/nginx.conf.bak
cp docker-compose.prod.yml /tmp/compose.bak
```

私有仓库需配置 SSH key 或用带 token 的 HTTPS 地址，否则 CI 里的 `git pull` 会因认证失败中断部署。

## 第三步：配置环境变量

```bash
cd /opt/ai-community
cp .env.prod.example .env
nano .env
```

必须修改的值：

```
# 镜像仓库凭据（GitHub Actions 把镜像推到这里，服务器从这里拉）
REGISTRY_URL=crpi-xxxxx.cn-beijing.personal.cr.aliyuncs.com
REGISTRY_NAMESPACE=你的命名空间
REGISTRY_USERNAME=你的阿里云账号
REGISTRY_PASSWORD=镜像服务固定密码

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
1. 校验 `.env` 必填项
2. 登录阿里云镜像仓库
3. 拉取最新镜像（前后端镜像由 GitHub Actions 构建并推送，服务器不编译代码）
4. 启动所有服务
5. 校验并热重载 Nginx 配置

Go 后端启动时通过 GORM AutoMigrate 自动建表，无需手动运行数据库迁移。默认频道数据也会自动初始化。

首次拉取镜像约 2-3 分钟。

> 推送 main 分支会触发 GitHub Actions 自动构建镜像并 SSH 到服务器执行 `git pull && ./deploy.sh`，
> 通常无需手动操作。手动部署仅用于首次初始化或排查问题。

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

修改 `.env` 里的 `NGINX_PORT=8080`

### 后端连不上数据库

Go 后端启动时 GORM 连接 PostgreSQL，如果 postgres 还没就绪会自动重试。如果持续失败，重启即可：

```bash
docker compose -f docker-compose.prod.yml restart server
```

### CORS 报错

检查 `.env` 里的 `CORS_ORIGIN` 是否包含前端页面的域名。

### 上传图片报 413 Request Entity Too Large

`nginx.conf` 是以 bind mount 挂载进容器的，改动它**不会**被 `docker compose up -d` 感知（镜像摘要与服务配置都没变，容器不会重建），运行中的 Nginx 仍用旧配置。
`deploy.sh` 已包含热重载步骤，若需手动执行：

```bash
cd /opt/ai-community
docker compose -f docker-compose.prod.yml exec nginx nginx -t       # 先校验语法
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

确认当前生效值（应为 35m，而非默认 1m）：

```bash
docker compose -f docker-compose.prod.yml exec nginx grep -r client_max_body_size /etc/nginx/
```

### 容器构建时内存不够

VPS 内存不足导致 OOM Kill，添加 swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```
