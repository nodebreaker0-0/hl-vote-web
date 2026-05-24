// Constitution I: static-only — output: 'export' is mandatory.
// Changing this line is delegation_matrix §1 🔴 confirm.
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Constitution III: mainnet activation is via env, never runtime.
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    // No server actions, no app-dir server features.
  },
};
export default nextConfig;
