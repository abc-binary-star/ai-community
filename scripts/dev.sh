#!/usr/bin/env bash
#
# 一键启动本地开发环境：PostgreSQL → 后端(Go) → 前端(Next)
#
# 用法：
#   ./scripts/dev.sh                启动（若 3000/3001 已被占用会自动停掉旧进程再启动）
#   ./scripts/dev.sh --early        启动，并让「读书大富翁」活动提前开始（测试用）
#   ./scripts/dev.sh --backend      仅重启后端（前端保持不变，适合后端小改动快速重启）
#   ./scripts/dev.sh --restart      显式重启（与默认行为一致）
#   ./scripts/dev.sh --stop         停掉正在运行的 dev 服务（3000/3001）
#   ./scripts/dev.sh --logs         查看最新日志
#   ./scripts/dev.sh --help
#
# 说明：
#   - 后端：server-go (Go)，监听 http://localhost:3001
#   - 前端：packages/web (Next.js 14)，监听 http://localhost:3000
#   - 数据库：PostgreSQL localhost:5432（本机或 Docker，按需拉起）
#   - 日志写入 .dev/backend.log / .dev/frontend.log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEV_DIR="$ROOT/.dev"
mkdir -p "$DEV_DIR"

# PID 文件，用于跨进程追踪
BACKEND_PID_FILE="$DEV_DIR/backend.pid"
FRONTEND_PID_FILE="$DEV_DIR/frontend.pid"

log()  { printf '\033[1;34m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

port_open() { (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
port_pids() { lsof -ti tcp:"$1" 2>/dev/null || true; }

# 杀掉 PID 文件记录的进程及其子进程树
kill_pid_file() {
  local pidfile="$1"
  [ -f "$pidfile" ] || return 0
  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [ -n "$pid" ] || { rm -f "$pidfile"; return 0; }
  if kill -0 "$pid" 2>/dev/null; then
    log "停止进程 (PID=$pid) 及其子进程…"
    # 先杀掉所有子孙进程（pkill -P 递归杀子进程）
    pkill -P "$pid" 2>/dev/null || true
    # 再杀主进程
    kill "$pid" 2>/dev/null || true
    sleep 1
    # 仍存活则强制杀
    if kill -0 "$pid" 2>/dev/null; then
      pkill -9 -P "$pid" 2>/dev/null || true
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pidfile"
}

stop_port() {
  local pids
  # 先尝试 PID 文件
  if [ "$1" = "3001" ] && [ -f "$BACKEND_PID_FILE" ]; then
    kill_pid_file "$BACKEND_PID_FILE"
  fi
  if [ "$1" = "3000" ] && [ -f "$FRONTEND_PID_FILE" ]; then
    kill_pid_file "$FRONTEND_PID_FILE"
  fi
  # 再用端口兜底清理残留
  pids="$(port_pids "$1")"
  if [ -n "$pids" ]; then
    log "清理端口 $1 残留进程: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(port_pids "$1")"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

# ---------- 参数解析 ----------
EARLY=0
BACKEND_ONLY=0
case "${1:-}" in
  --early|-e) EARLY=1 ;;
  --backend|-b) BACKEND_ONLY=1 ;;
  --restart|-r) : ;; # 默认行为即重启，保留兼容入口
  --stop)
    stop_port 3000
    stop_port 3001
    log "已停止 dev 服务"
    exit 0
    ;;
  --logs)
    tail -n 40 "$DEV_DIR/backend.log" 2>/dev/null || true
    echo "--- frontend ---"
    tail -n 40 "$DEV_DIR/frontend.log" 2>/dev/null || true
    exit 0
    ;;
  --help|-h)
    sed -n '2,18p' "$0"
    exit 0
    ;;
  "") ;;
  *) die "未知参数: $1（支持 --early / --backend / --restart / --stop / --logs / --help）" ;;
esac

# ---------- 模式分支：仅重启后端 ----------
if [ "$BACKEND_ONLY" = "1" ]; then
  log "仅重启后端模式（前端保持不变）…"
  stop_port 3001
  if port_open 3001; then stop_port 3001; fi

  log "启动后端 (http://localhost:3001)…"
  (
    cd server-go
    if [ "$EARLY" = "1" ]; then
      HELLBOARD_START_OFFSET_DAYS=4 GOCACHE="$DEV_DIR/go-build-cache" go run ./cmd/server
    else
      GOCACHE="$DEV_DIR/go-build-cache" go run ./cmd/server
    fi
  ) >"$DEV_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

  # 等待后端健康检查
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
  echo "=============================================="
  echo "  ✅ 后端已重启"
  echo "     后端    http://localhost:3001"
  echo "     日志: $DEV_DIR/backend.log"
  echo "=============================================="
  echo ""
  # 后端模式下不阻塞，直接退出（前端仍在另一个进程跑着）
  # 解除 trap 以免退出时误杀前端
  trap - EXIT INT TERM
  exit 0
fi

# ---------- 全量重启模式 ----------
# 端口已被占用时一律先停掉再启动（等同 --restart）
if port_open 3000 || port_open 3001; then
  log "检测到 3000/3001 已有进程，先停止旧进程再启动…"
  stop_port 3000
  stop_port 3001
fi
# 若仍有残留则强制清理
if port_open 3000; then stop_port 3000; fi
if port_open 3001; then stop_port 3001; fi

# ---------- 必备工具 ----------
for cmd in node pnpm go; do
  command -v "$cmd" >/dev/null 2>&1 || die "缺少 $cmd，请先安装"
done

# ---------- 依赖 ----------
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
    log "启动本机 PostgreSQL（brew services）…"
    brew services start postgresql@16 >/dev/null 2>&1 || true
  else
    warn "未检测到 PostgreSQL（5432 未监听）。若使用远程数据库可忽略；否则请先安装/启动 PostgreSQL。"
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
  kill_pid_file "$BACKEND_PID_FILE"
  kill_pid_file "$FRONTEND_PID_FILE"
  # 兜底：若 PID 文件已被删除但进程仍在，用变量中的 PID 再杀一次
  if [ -n "$BACKEND_PID" ]; then
    pkill -P "$BACKEND_PID" 2>/dev/null || true
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    pkill -P "$FRONTEND_PID" 2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 活动提前开始（测试用）：HELLBOARD_START_OFFSET_DAYS>0 会把 9/1 提前 N 天
# 不加 --early 时不注入该变量，正式 9/1 自动开始
if [ "$EARLY" = "1" ]; then
  log "【测试模式】读书大富翁活动提前开始（HELLBOARD_START_OFFSET_DAYS=4）"
fi

log "启动后端 (http://localhost:3001)…"
(
  cd server-go
  if [ "$EARLY" = "1" ]; then
    HELLBOARD_START_OFFSET_DAYS=4 GOCACHE="$DEV_DIR/go-build-cache" go run ./cmd/server
  else
    GOCACHE="$DEV_DIR/go-build-cache" go run ./cmd/server
  fi
) >"$DEV_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

log "启动前端 (http://localhost:3000)…"
(
  cd packages/web
  pnpm dev
) >"$DEV_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

# 等待后端健康检查
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

# 等前端就绪（首请求触发编译，可能较慢）
for _ in $(seq 1 120); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/activity/hell-board 2>/dev/null || true)"
  case "$code" in
    200|307|308) break ;;
  esac
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo ""
    echo "❌ 前端启动失败，最近日志："
    tail -30 "$DEV_DIR/frontend.log" || true
    exit 1
  fi
  sleep 1
done

echo ""
echo "=============================================="
echo "  ✅ 本地开发环境已就绪"
echo "     前端    http://localhost:3000"
echo "     活动页  http://localhost:3000/activity/hell-board"
echo "     后端    http://localhost:3001"
echo ""
if [ "$EARLY" = "1" ]; then
  echo "  🎲 活动已提前开始（测试模式）"
else
  echo "  📖 活动按正式周期 9/1 开始"
fi
echo ""
echo "  日志: $DEV_DIR/backend.log / $DEV_DIR/frontend.log"
echo "  按 Ctrl+C 同时停止前后端"
echo "=============================================="
echo ""

# 自动打开浏览器（macOS 用 open，Linux 用 xdg-open；未检测到则跳过）
if command -v open >/dev/null 2>&1; then
  open "http://localhost:3000/activity/hell-board"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000/activity/hell-board"
fi

wait "$BACKEND_PID" "$FRONTEND_PID"
