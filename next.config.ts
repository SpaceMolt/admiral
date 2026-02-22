import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  allowedDevOrigins: ['192.168.64.10'],
}

export default nextConfig
