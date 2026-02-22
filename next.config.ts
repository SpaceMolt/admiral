import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  allowedDevOrigins: ['*'],
}

export default nextConfig
