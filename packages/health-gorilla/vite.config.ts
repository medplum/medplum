import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

const viteConfig = defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@medplum-ee/hg-client': path.resolve('./src'),
    },
  },
  publicDir: 'static',
  build: {
    sourcemap: true,
  },
});

const vitestConfig = defineVitestConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
  },
});

export default mergeConfig(viteConfig, vitestConfig);
