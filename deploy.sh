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
  echo " .env template created. Edit it first: nano .env"
  echo " Then run again: ./deploy.sh"
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
    echo "[FAIL] $var is empty or still a template value in .env"
    exit 1
  fi
done
echo "[OK] .env validated"

# 3. 登录阿里云镜像仓库
echo "==> Login registry $REGISTRY_URL"
echo "$REGISTRY_PASSWORD" | docker login -u "$REGISTRY_USERNAME" "$REGISTRY_URL" --password-stdin

# 4. 拉取最新镜像
echo "==> Pull latest images"
docker compose -f docker-compose.prod.yml pull

# 5. 启动服务
echo "==> Start services"
docker compose -f docker-compose.prod.yml up -d

# 6. 重载 Nginx 配置
# nginx.conf 是 bind mount 挂进容器的：改文件不会改变镜像摘要与服务配置，
# up -d 因此不会重建 nginx 容器，配置变更（如 client_max_body_size）不会生效。
# 这里显式校验并热重载，让 nginx.conf 的改动随部署自动落地。
echo "==> Reload Nginx config"
compose="docker compose -f docker-compose.prod.yml"
# 等待 nginx 容器就绪：容器首次创建时主进程可能还没起来，直接 reload 会失败
for _ in $(seq 1 10); do
  $compose exec -T nginx nginx -t >/dev/null 2>&1 && break
  sleep 1
done
if $compose exec -T nginx nginx -t; then
  # reload 失败（如容器刚启动）不阻断部署：此时容器加载的已是最新配置
  if $compose exec -T nginx nginx -s reload; then
    echo "[OK] Nginx config reloaded"
  else
    echo "[INFO] Nginx just started with latest config, reload not needed"
  fi
else
  echo "[FAIL] Nginx config test failed, keeping current config. Check nginx.conf"
  exit 1
fi

# 7. 显示状态
echo "==> Service status"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "============================================="
echo " Deploy done. Open: $CORS_ORIGIN/community"
echo " Logs: docker compose -f docker-compose.prod.yml logs -f"
echo "============================================="
