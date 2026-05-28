import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // WSL2: move .next to Linux filesystem — Turbopack cache fails on NTFS (/mnt/c/)
  distDir: "/tmp/hh-next",
  // WSL2: poll filesystem because inotify doesn't work on /mnt/c/
  watchOptions: {
    pollIntervalMs: 1000,
  },
};

export default nextConfig;
