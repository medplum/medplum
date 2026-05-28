import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // WSL2: poll filesystem because inotify doesn't work on /mnt/c/
  watchOptions: {
    usePolling: true,
    pollIntervalMs: 1000,
  },
};

export default nextConfig;
