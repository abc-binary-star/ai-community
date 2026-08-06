#!/usr/bin/env bash
# AI Community 开发环境启动脚本
# 用法：./dev.sh
# 功能：启动 PostgreSQL → 安装依赖 → 生成 Prisma Client → 推送数据库 Schema → 启动前后端

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
UNDERLINE='\033[4m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }

# ---------- 1. 检查依赖 ----------
info "检查运行环境..."

command -v node >/dev/null 2>&1 || fail "未找到 node，请先安装 Node.js >= 20"
command -v pnpm >/dev/null 2>&1 || fail "未找到 pnpm，请先安装: npm i -g pnpm"

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VERSION" -ge 20 ] || fail "Node.js 版本需 >= 20，当前为 $(node -v)"

ok "Node $(node -v) / pnpm $(pnpm -v)"

# ---------- 2. 启动 PostgreSQL ----------
info "检查 PostgreSQL..."

if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  # 本地 PostgreSQL 已在运行（Homebrew 等）
  ok "检测到本地 PostgreSQL 已运行"
elif command -v docker >/dev/null 2>&1; then
  # 使用 Docker 启动
  info "本地未检测到 PostgreSQL，使用 Docker 启动..."
  docker compose up -d 2>/dev/null || fail "Docker 启动失败，请确认 Docker Desktop 正在运行"

  info "等待数据库就绪..."
  for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U aicom >/dev/null 2>&1; then
      ok "PostgreSQL（Dsk-48309783d7c5423ea3d853e18129059cocker）已就绪"
      break
    fi
    [ "$i" -eq 30 ] && fail "数据库连接超时（30s）"
    sleep 1
  done
else
  fail "未检测到 PostgreSQL，且未安装 Docker。请安装其一：\n  brew install postgresql@16  或  安装 Docker Desktop"
fi

# ---------- 3. 安装依赖 ----------
if [ ! -d "node_modules" ]; then
  info "安装项目依赖..."
  pnpm install
  ok "依赖安装完成"
else
  ok "node_modules 已存在，跳过安装（如需重装请先删除）"
fi

# ---------- 4. 生成 Prisma Client ----------
info "生成 Prisma Client..."
pnpm --filter server exec prisma generate
ok "Prisma Client 已生成"

# ---------- 5. 推送数据库 Schema ----------
info "推送数据库 Schema..."
pnpm --filter server exec prisma db push
ok "数据库 Schema 已同步"

# ---------- 6. 启动前后端 ----------
info "启动前后端服务..."

# 后台启动 pnpm dev，日志输出到管道
pnpm dev > /tmp/aicom-dev.log 2>&1 &
DEV_PID=$!

# Ctrl+C 时清理子进程
trap 'kill $DEV_PID 2>/dev/null; exit 0' INT TERM

# 轮询等待服务就绪
wait_for_port() {
  local port=$1
  local name=$2
  for i in $(seq 1 60); do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null | grep -qE '^[2-4]'; then
      ok "$name 已就绪 (http://localhost:$port)"
      return 0
    fi
    sleep 1
  done
  return 1
}

WEB_OK=false
SERVER_OK=false

wait_for_port 3000 "前端 (web)"  && WEB_OK=true
wait_for_port 3001 "后端 (server)" && SERVER_OK=true

echo ""
if [ "$WEB_OK" = true ] && [ "$SERVER_OK" = true ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  ✅ AI Community 开发环境已就绪${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo -e "  前端：  ${GREEN}${UNDERLINE}http://localhost:3000${NC}"
  echo -e "  后端：  ${GREEN}${UNDERLINE}http://localhost:3001${NC}"
  echo ""
  echo -e "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
  echo ""
elif [ "$WEB_OK" = false ] && [ "$SERVER_OK" = false ]; then
  fail "前后端均启动失败，日志如下：\n$(cat /tmp/aicom-dev.log)"
else
  warn "部分服务启动失败（web=$WEB_OK, server=$SERVER_OK），日志："
  cat /tmp/aicom-dev.log
fi

# 保持前台运行，显示实时日志
tail -f /tmp/aicom-dev.log 2>/dev/null || wait $DEV_PID
