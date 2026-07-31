# ---- 前端 Next.js 镜像（monorepo 构建，standalone 模式）----
FROM node:20-alpine AS builder
WORKDIR /app

# 1. 复制整个项目
COPY . .

# 2. 在 web 目录安装全部依赖
WORKDIR /app/packages/web
RUN npm install

# 3. 构建 Next.js（使用 transpilePackages 处理 shared）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 运行时镜像（最小化）----
FROM node:20-alpine AS runner
WORKDIR /app/packages/web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 4. 拷贝 Next.js standalone 产物
# standalone 模式会在 .next/standalone 下生成一个自包含的 Node.js 应用
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./.next/static
COPY --from=builder /app/packages/web/public ./public 2>/dev/null || true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/community || exit 1

USER node
CMD ["node", "server.js"]
