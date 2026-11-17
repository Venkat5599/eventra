import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: root,
  async rewrites() {
    const origin = process.env.EVENTRA_API_ORIGIN
    if (!origin) return []
    return [{ source: "/api/:path*", destination: `${origin.replace(/\/$/, "")}/api/:path*` }]
  },
}

export default nextConfig
