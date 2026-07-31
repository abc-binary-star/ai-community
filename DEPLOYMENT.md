# 🚀 AI Community 生产部署指南（VPS + Docker）

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
       │                    │  后端 Hono      │
       │                    │  (Node 3001)    │
       │                    └──────┬──────────┘
       │                           │
       │                    ┌──────┴──────┐
       │                    │ PostgreSQL  │
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
- **CPU**: 1 核
- **内存**: 2 GB（推荐 4 GB，构建时更流畅）
- **硬盘**: 20 GB SSD
- **系统**: Ubuntu 22.04 LTS / Debian 12
- **带宽**: 5 Mbps 以上

阿里云/腾讯云/华为云学生机约 ¥9.9-30/月。

### 2. 开放防火墙端口

在云厂商控制台的"安全组"里开放：
- **80** (HTTP) — 必开
- **443** (HTTPS) — 配 SSL 时开
- **22** (SSH) — 默认已开

> ⚠️ 不需要开放 3000、3001、5432 端口！所有内部通信由 Docker 网络处理，只有 Nginx 的 80 端口暴露到公网。

### 3. 安装 Docker

登录 VPS 后执行：

```bash
# Ubuntu/Debian 一键安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 启动 Docker 并设置开机自启
sudo systemctl enable docker
sudo systemctl start docker

# 验证
docker --version
docker compose version
```

## 第二步：上传项目到 VPS

### 方式 A：Git 拉取（推荐）

```bash
# 在 VPS 上
cd /opt
git clone https://github.com/你的用户名/ai-community.git
cd ai-community
```

### 方式 B：scp 上传

```bash
# 在本地 Mac 上
scp -r /Users/xqd_mac/codeing/ai-community root@你的服务器IP:/opt/
```

## 第三步：配置环境变量

```bash
cd /opt/ai-community

# 复制模板
cp .env.production .env.production

# 编辑关键配置
nano .env.production
```

**必须修改的 2 个值**：

```
# 1. JWT 密钥（必须更换！用下面命令生成）
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=a1b2c3d4e5f6...（随机 64 位十六进制）

# 2. CORS 域名
#    如果用 IP 访问：CORS_ORIGIN=http://你的服务器IP
#    如果用域名：CORS_ORIGIN=https://你的域名
CORS_ORIGIN=http://123.45.67.89
```

## 第四步：一键部署

```bash
cd /opt/ai-community
bash deploy.sh
```

脚本会自动完成：
1. ✅ 检查 Docker 环境
2. ✅ 加载环境变量
3. ✅ 构建 Docker 镜像（后端 + 前端）
4. ✅ 启动所有服务
5. ✅ 运行 Prisma 数据库迁移

**首次构建约 3-5 分钟**（取决于 VPS 网速和 CPU）。

看到这个说明成功：
```
🎉 部署完成！

访问地址：
  本机:   http://localhost:80
  外网:   http://你的服务器IP:80
```

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

# 完全停止 + 删除数据库（⚠️ 会清空所有数据）
docker compose -f docker-compose.prod.yml down -v
```

## 更新应用代码

```bash
cd /opt/ai-community
git pull origin main
bash deploy.sh   # 重新构建并启动（数据库数据不会丢）
```

## 配置 HTTPS（可选，域名场景）

如果有域名，推荐用 Caddy 自动申请 Let's Encrypt 证书：

```bash
# 停止当前 Nginx
docker compose -f docker-compose.prod.yml down

# 用 Caddy 替换 Nginx（修改 docker-compose.prod.yml）
# ... (略，如果你需要 HTTPS 可以单独问我)
```

或者用 certbot + 现有 Nginx，复杂度更高，推荐 Caddy 方案。

## 故障排查

### 问题：端口被占用
```
ERROR: bind: address already in use
```
解决：修改 `.env.production` 里的 `NGINX_PORT=8080`

### 问题：后端连不上数据库
```
server exited with code 1
PrismaClientKnownRequestError: ... connection refused
```
原因：postgres 服务还没就绪就启动了后端
解决：重启即可 `docker compose -f docker-compose.prod.yml restart`

### 问题：前端 API 报错 CORS
```
Access to fetch ... has been blocked by CORS
```
解决：检查 `.env.production` 里的 `CORS_ORIGIN` 是否包含前端页面的域名

### 问题：容器构建时内存不够
```
Killed
npm error
```
VPS 内存不足导致 Node.js 被 OOM Kill
解决：增加 swap 或升级 VPS 内存

```bash
# Ubuntu 添加 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudo echo '/swapfile none swap sw 0 0' >> /etc/fstab
```
