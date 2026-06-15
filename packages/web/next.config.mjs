/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is run explicitly via `pnpm lint`; keep `next build` focused on compiling.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
