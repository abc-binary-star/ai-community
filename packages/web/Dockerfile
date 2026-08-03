# ---- 前端 Next.js 镜像（monorepo 构建，standalone 模式）----
FROM node:20-alpine AS builder
WORKDIR /app

# 安装 pnpm（版本与仓库 packageManager 对齐）
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 1. 复制整个项目（含 workspace 的 shared 包）
COPY . .

# 2. 在仓库根目录安装全部依赖（pnpm workspace 才能解析 workspace:*）
RUN pnpm install --frozen-lockfile

# 3. 构建 Next.js（使用 transpilePackages 处理 shared）
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ---- 运行时镜像（最小化）----
FROM node:20-alpine AS runner
# monorepo：standalone 产物会带 packages/web 前缀，工作目录设为仓库根
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 4. 拷贝 Next.js standalone 产物（含 server.js + 追踪到的依赖）
COPY --from=builder /app/packages/web/.next/standalone ./
# 5. 拷贝静态资源到 standalone 对应的 web 目录
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/community || exit 1

USER node
CMD ["node", "packages/web/server.js"]
