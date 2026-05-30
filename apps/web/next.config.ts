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
    // Backwards-compat: Portuguese URLs → canonical English URLs
    return [
      { source: '/cadastro',            destination: '/signup',                      permanent: true },
      { source: '/agenda',              destination: '/schedule',                    permanent: true },
      { source: '/pacientes',           destination: '/patients',                    permanent: true },
      { source: '/pacientes/:id',       destination: '/patients/:id',               permanent: true },
      { source: '/pacientes/:id/evolucao', destination: '/patients/:id/notes',      permanent: true },
      { source: '/evolucoes',           destination: '/notes',                       permanent: true },
      { source: '/financeiro',          destination: '/billing',                     permanent: true },
      { source: '/configuracoes',       destination: '/settings',                    permanent: true },
    ];
  },
};

export default nextConfig;
