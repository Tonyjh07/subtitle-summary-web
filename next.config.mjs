/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯前端形态：无外部后端代理（/backend-api rewrites 已随 Python 后端一并删除），
  // 所有服务端逻辑都在同仓库 Route Handlers（src/app/api）。
};

export default nextConfig;
