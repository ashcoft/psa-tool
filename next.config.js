/** @type {import('next').NextConfig} */
const pkg = require('./package.json')
const output =
  process.env.NEXT_OUTPUT === 'standalone' || process.env.NEXT_OUTPUT === 'export'
    ? process.env.NEXT_OUTPUT
    : undefined
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  ...(output ? { output } : {}),
  ...(output === 'export' ? { trailingSlash: true } : {}),
  ...(basePath ? { basePath } : {}),
}

module.exports = nextConfig