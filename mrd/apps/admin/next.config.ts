import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mrd/ui"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
