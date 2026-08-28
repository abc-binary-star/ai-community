#!/usr/bin/env bash
# 兼容入口：真正的启动逻辑在 scripts/dev.sh
# 用法见 scripts/dev.sh --help，或直接运行：
#   ./dev.sh                启动
#   ./dev.sh --early        启动 + 活动提前开始（测试）
#   ./dev.sh --restart      重启
#   ./dev.sh --stop         停止
#   ./dev.sh --logs         看日志
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/dev.sh" "$@"
