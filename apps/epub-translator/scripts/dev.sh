#!/bin/bash
# 本地开发启动脚本

set -e

cd "$(dirname "$0")/.."

# 检查 .env
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件，正在从 .env.example 创建..."
    cp .env.example .env
    echo "✅ 已创建 .env，请编辑填入 ARK_API_KEY"
fi

# 加载环境变量
export $(grep -v '^#' .env | xargs)

echo "🚀 启动 EPUB 翻译 Agent..."
echo "   配置: configs/config.yaml"
echo "   模型: $(grep 'model:' configs/config.yaml | head -1)"
echo ""

go run ./cmd/server -config configs/config.yaml
