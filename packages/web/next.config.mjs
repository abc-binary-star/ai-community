/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // shared 是 workspace 内的 TS 源码包，需要 Next 一起转译
  transpilePackages: ['shared'],
  // standalone 模式：生产构建时生成独立的 Node.js 应用，无需 node_modules
  // 这大幅减小了 Docker 镜像体积，是 Next.js 生产部署的最佳实践
  output: 'standalone',
}

export default nextConfig
