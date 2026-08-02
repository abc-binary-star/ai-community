#!/bin/bash
# ============================================
# AI Community 一键部署脚本
# 后端：Go (Hertz + GORM)，启动时自动迁移
# 前端：Next.js
# ============================================
# 使用方法：
#   1. 把整个项目推到服务器的某个目录（如 /opt/ai-community）
#   2. cd /opt/ai-community
#   3. 先复制环境变量模板：cp .env.production .env.production && 编辑 JWT_SECRET
#   4. 运行：bash deploy.sh
# ============================================

set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  AI Community 生产部署"
echo "============================================"

# 检查依赖
echo ""
echo "[1/4] 检查 Docker 环境..."
command -v docker >/dev/null 2>&1 || { echo "❌ 未检测到 Docker，请先安装 Docker"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ 未检测到 docker compose 插件"; exit 1; }
echo "✅ Docker: $(docker --version)"
echo "✅ Compose: $(docker compose version)"

# 加载环境变量
echo ""
echo "[2/4] 加载环境变量..."
if [ ! -f .env.production ]; then
    echo "❌ .env.production 不存在，请先创建"; exit 1
fi
source .env.production

# 检查 JWT_SECRET 是否已改
if [[ "$JWT_SECRET" == *"change-me"* ]]; then
    echo "⚠️  ⚠️  ⚠️  JWT_SECRET 还是默认值！"
    echo "   必须修改为随机字符串，否则任何人可以伪造登录 token！"
    echo "   生成命令: openssl rand -hex 32"
    echo ""
    read -p "   输入新的 JWT_SECRET (或直接回车跳过): " JWT_SECRET
    if [ -n "$JWT_SECRET" ]; then
        sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env.production 2>/dev/null || \
        sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env.production
        echo "   ✅ JWT_SECRET 已更新"
    else
        echo "   ⚠️  跳过了，但强烈建议修改！"
    fi
fi

echo "✅ 环境变量已加载"
echo "   - JWT_SECRET: ${JWT_SECRET:0:8}..."
echo "   - CORS_ORIGIN: $CORS_ORIGIN"
echo "   - NGINX_PORT: ${NGINX_PORT:-80}"
echo "   - DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:+已配置}${DEEPSEEK_API_KEY:-未配置}"

# 构建并启动
echo ""
echo "[3/4] 构建 Docker 镜像..."
docker compose -f docker-compose.prod.yml build --no-cache \
  server web 2>&1 | tail -5

echo ""
echo "[4/4] 启动服务..."
# 停止旧容器（如果存在）
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
# 后台启动（Go 后端启动时 GORM AutoMigrate 自动建表，无需额外迁移步骤）
docker compose -f docker-compose.prod.yml up -d

# 等待服务就绪
echo ""
echo "等待服务启动..."
sleep 5

echo ""
echo "============================================"
echo "  🎉 部署完成！"
echo "============================================"
echo ""
echo "服务状态："
docker compose -f docker-compose.prod.yml ps
echo ""
echo "访问地址："
echo "  本机:   http://localhost:${NGINX_PORT:-80}"
echo "  外网:   http://$(hostname -I 2>/dev/null | awk '{print $1}'):${NGINX_PORT:-80}"
echo ""
echo "常用命令："
echo "  查看日志:  docker compose -f docker-compose.prod.yml logs -f"
echo "  查看后端:  docker compose -f docker-compose.prod.yml logs -f server"
echo "  查看前端:  docker compose -f docker-compose.prod.yml logs -f web"
echo "  重启:      docker compose -f docker-compose.prod.yml restart"
echo "  停止:      docker compose -f docker-compose.prod.yml down"
echo "  清数据:    docker compose -f docker-compose.prod.yml down -v"
echo ""
