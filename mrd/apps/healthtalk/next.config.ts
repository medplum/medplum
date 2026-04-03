import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mrd/ui", "@mrd/gateway-client"],
};

export default nextConfig;
