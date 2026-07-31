/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // shared 是 workspace 内的 TS 源码包，需要 Next 一起转译
  transpilePackages: ['shared'],
}

export default nextConfig
