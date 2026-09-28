/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@vtex/core", "@vtex/router", "@vtex/wallet"],
  output: "standalone",
}

export default nextConfig
