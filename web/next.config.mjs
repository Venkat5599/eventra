/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const origin = process.env.EVENTRA_API_ORIGIN
    if (!origin) return []
    return [{ source: "/api/:path*", destination: `${origin.replace(/\/$/, "")}/api/:path*` }]
  },
}

export default nextConfig
