/** @type {import('next').NextConfig} */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  reactStrictMode: true,
  // shared 是 workspace 内的 TS 源码包，需要 Next 一起转译
  transpilePackages: ['shared'],
  experimental: {
    // 页面在预渲染阶段会因 useSearchParams() 未包 Suspense 而报错。
    // 这些页面均为客户端渲染、运行时读取 URL 参数（列表筛选/搜索/通知等），
    // 启用该选项让 Next 在构建时降级为 CSR bailout 而非报错（Next 14 官方选项）。
    missingSuspenseWithCSRBailout: false,
  },
  // standalone 模式：生产构建时生成独立的 Node.js 应用，无需 node_modules
  // 这大幅减小了 Docker 镜像体积，是 Next.js 生产部署的最佳实践
  output: 'standalone',
  // 显式指定 monorepo 根为 tracing root，保证 standalone 输出结构稳定
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // 开发模式下通过 Next.js 代理 API 请求，避免浏览器跨域限制
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ]
  },
}

export default nextConfig
