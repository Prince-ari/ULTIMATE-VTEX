/** @type {import('next').NextConfig} */

const nextConfig = {
  // @vtex/money est livré compilé en CommonJS (dist/) : il ne doit pas repasser par SWC (l'injection HMR y échoue).
  transpilePackages: ["@vtex/core", "@vtex/router", "@vtex/wallet"],
  output: "standalone",
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000"
    return [
      { source: "/api/trpc/:path*", destination: `${api}/api/trpc/:path*` },
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
      { source: "/api/media/:path*", destination: `${api}/api/media/:path*` },
      { source: "/api/events", destination: `${api}/api/events` },
    ]
  },
}

export default nextConfig
