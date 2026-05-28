import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // WSL2: set pollIntervalMs to enable polling (inotify doesn't work on /mnt/c/)
  watchOptions: {
    pollIntervalMs: 1000,
  },
};

export default nextConfig;
