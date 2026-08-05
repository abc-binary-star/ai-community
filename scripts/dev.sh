#!/usr/bin/env bash
#
# 一键启动本地开发环境：数据库（按需）→ 后端 → 前端
# 用法：
#   ./scripts/dev.sh            # 启动（端口被占用时报错）
#   ./scripts/dev.sh --restart  # 先停掉占用 3000/3001 的旧进程再启动
#   ./scripts/dev.sh --help
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEV_DIR="$ROOT/.dev"
mkdir -p "$DEV_DIR"

log()  { printf '\033[1;34m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

port_open() { (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
port_pids() { lsof -ti tcp:"$1" 2>/dev/null || true; }

stop_port() {
  local pids
  pids="$(port_pids "$1")"
  if [ -n "$pids" ]; then
    log "停止占用端口 $1 的进程: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

RESTART=0
case "${1:-}" in
  --restart|-r) RESTART=1 ;;
  --help|-h)
    sed -n '2,7p' "$0"
    exit 0
    ;;
  "") ;;
  *) die "未知参数: $1（支持 --restart / --help）" ;;
esac

if [ "$RESTART" = "1" ]; then
  stop_port 3000
  stop_port 3001
fi
if port_open 3000 || port_open 3001; then
  die "端口 3000/3001 已被占用。可先手动停止旧进程，或运行 ./scripts/dev.sh --restart 一键重启"
fi

# 检查必备工具
for cmd in node pnpm go; do
  command -v "$cmd" >/dev/null 2>&1 || die "缺少 $cmd，请先安装"
done

# 依赖安装
if [ ! -d node_modules ]; then
  log "安装根目录依赖…"
  pnpm install
fi
if [ ! -d packages/web/node_modules ]; then
  log "安装前端依赖…"
  (cd packages/web && pnpm install)
fi

# ---------- PostgreSQL ----------
ensure_postgres() {
  port_open 5432 && return 0

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    log "检测到 Docker，启动 PostgreSQL 容器…"
    docker compose -f services/docker-compose.yml up -d postgres
  elif command -v brew >/dev/null 2>&1 && brew list --versions postgresql@16 >/dev/null 2>&1; then
    log "启动本机 PostgreSQL 服务（brew services）…"
    brew services start postgresql@16 >/dev/null 2>&1 || true
  else
    warn "未检测到 PostgreSQL（5432 未监听）。若已使用远程数据库，可忽略；否则请先安装/启动 PostgreSQL。"
    return 1
  fi

  for _ in $(seq 1 30); do
    port_open 5432 && return 0
    sleep 1
  done
  warn "PostgreSQL 启动超时，请检查后重试"
  return 1
}

ensure_database() {
  command -v psql >/dev/null 2>&1 || return 0

  # 已存在且可连接则跳过
  if psql -h 127.0.0.1 -U aicom -d aicom -c 'select 1' >/dev/null 2>&1; then
    return 0
  fi

  log "初始化本地 aicom 数据库角色/库（best-effort）…"
  if ! psql -h 127.0.0.1 -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='aicom'" 2>/dev/null | grep -q 1; then
    psql -h 127.0.0.1 -d postgres -c "CREATE ROLE aicom LOGIN PASSWORD 'aicom_dev'" >/dev/null 2>&1 \
      || warn "创建 aicom 角色失败，请手动创建"
  fi
  if ! psql -h 127.0.0.1 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='aicom'" 2>/dev/null | grep -q 1; then
    psql -h 127.0.0.1 -d postgres -c "CREATE DATABASE aicom OWNER aicom" >/dev/null 2>&1 \
      || warn "创建 aicom 数据库失败，请手动创建"
  fi
}

ensure_postgres || true
ensure_database

# ---------- 启动服务 ----------
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

log "启动后端 (http://localhost:3001)…"
(
  cd server-go
  GOCACHE="$DEV_DIR/go-build-cache" go run ./cmd/server
) >"$DEV_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

log "启动前端 (http://localhost:3000)…"
(
  cd packages/web
  pnpm dev
) >"$DEV_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# 等待后端健康检查通过
for _ in $(seq 1 90); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ""
    echo "❌ 后端启动失败，最近日志："
    tail -30 "$DEV_DIR/backend.log" || true
    exit 1
  fi
  sleep 1
done

if ! curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
  echo ""
  echo "❌ 后端健康检查超时，最近日志："
  tail -30 "$DEV_DIR/backend.log" || true
  exit 1
fi

echo ""
log "✅ 后端就绪: http://localhost:3001"
log "✅ 前端地址: http://localhost:3000"
log "日志文件: $DEV_DIR/backend.log / $DEV_DIR/frontend.log"
log "按 Ctrl+C 同时停止前后端"
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
