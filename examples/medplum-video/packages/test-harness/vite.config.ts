import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // lightningcss chokes on un-processed Mantine CSS vars (e.g. `$mantine-breakpoint-xs`)
    // that ship in @medplum/react prebuilt CSS.  esbuild's CSS minifier is more forgiving.
    cssMinify: 'esbuild',
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: true,
    // Proxy Medplum API through Vite so the patient link works from any LAN device.
    // Without this, phones/tablets can't reach localhost:8103.
    proxy: {
      '/medplum-api': {
        target: 'http://localhost:8103',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/medplum-api/, ''),
      },
    },
  },
});
