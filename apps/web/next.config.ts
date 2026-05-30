import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // WSL2: move .next to Linux filesystem — Turbopack cache fails on NTFS (/mnt/c/)
  distDir: "/tmp/hh-next",
  // WSL2: poll filesystem because inotify doesn't work on /mnt/c/
  watchOptions: {
    pollIntervalMs: 1000,
  },
  async redirects() {
    return [
      // Auth
      { source: '/signup',   destination: '/cadastro', permanent: false },
      { source: '/register', destination: '/cadastro', permanent: false },
      // App pages
      { source: '/schedule', destination: '/agenda',    permanent: false },
      { source: '/patients', destination: '/pacientes', permanent: false },
      { source: '/patients/:id', destination: '/pacientes/:id', permanent: false },
      { source: '/patients/:id/notes', destination: '/pacientes/:id/evolucao', permanent: false },
      { source: '/notes',    destination: '/evolucoes', permanent: false },
      { source: '/billing',  destination: '/financeiro', permanent: false },
    ];
  },
};

export default nextConfig;
