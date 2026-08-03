#!/usr/bin/env bash
# ============================================================
# AI Community 一键部署脚本（在服务器上项目根目录执行）
# 用法：
#   1. cp .env.prod.example .env && nano .env   # 填入你的密钥
#   2. ./deploy.sh                              # 一键部署
# 后续更新：git pull && ./deploy.sh
# ============================================================
set -e
cd "$(dirname "$0")"

# 1. 检查 .env 是否已配置
if [ ! -f .env ]; then
  cp .env.prod.example .env
  echo "============================================="
  echo " 已生成 .env 模板，请先编辑填写：nano .env"
  echo " 填好后重新运行：./deploy.sh"
  echo "============================================="
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# 2. 校验必填项
for var in REGISTRY_URL REGISTRY_NAMESPACE REGISTRY_USERNAME REGISTRY_PASSWORD JWT_SECRET CORS_ORIGIN; do
  value=$(eval echo "\$$var")
  if [ -z "$value" ] || [[ "$value" == *替换为* ]]; then
    echo "❌ .env 中 $var 未填写或还是模板值，请先编辑 .env"
    exit 1
  fi
done
echo "✅ .env 校验通过"

# 3. 登录阿里云镜像仓库
echo "==> 登录镜像仓库 $REGISTRY_URL"
echo "$REGISTRY_PASSWORD" | docker login -u "$REGISTRY_USERNAME" "$REGISTRY_URL" --password-stdin

# 4. 拉取最新镜像
echo "==> 拉取最新镜像"
docker compose -f docker-compose.prod.yml pull

# 5. 启动服务
echo "==> 启动服务"
docker compose -f docker-compose.prod.yml up -d

# 6. 显示状态
echo "==> 服务状态"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "============================================="
echo " 部署完成！浏览器访问：$CORS_ORIGIN/community"
echo " 查看日志：docker compose -f docker-compose.prod.yml logs -f"
echo "============================================="
