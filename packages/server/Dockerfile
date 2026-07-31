# ---- 后端 API 镜像（monorepo 构建）----
FROM node:20-alpine AS builder
WORKDIR /app

# 1. 复制整个项目（利用 monorepo workspace）
COPY . .

# 2. 在 server 目录安装全部依赖（含 devDependencies，用于编译）
WORKDIR /app/packages/server
RUN npm install

# 3. 生成 Prisma Client
RUN npx prisma generate

# 4. 编译 TypeScript 到 dist/
RUN npm run build

# ---- 运行时镜像（最小化，仅含生产依赖）----
FROM node:20-alpine AS runner
WORKDIR /app/packages/server

ENV NODE_ENV=production

# 5. 拷贝编译产物
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/package.json ./
COPY --from=builder /app/packages/server/prisma ./prisma

# 6. 拷贝 shared 源文件（运行时需要）
COPY --from=builder /app/packages/shared ../shared

# 7. 仅安装生产依赖（不含 devDependencies）
# 注意：npm install --production 会解析 workspace 依赖，找到 shared 的源文件
RUN npm install --production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

USER node
CMD ["node", "dist/index.js"]
