import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@mrd/ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'hebbkx1anhila5yf.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default nextConfig;
