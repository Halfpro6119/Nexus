/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  experimental: {
    turbopackRustReactCompiler: true,
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
    // This Windows workspace has slow and unreliable writes under .next/dev.
    // Keep Turbopack in memory during development to avoid cache stalls.
    turbopackFileSystemCacheForDev: false,
  },
};
export default nextConfig;
