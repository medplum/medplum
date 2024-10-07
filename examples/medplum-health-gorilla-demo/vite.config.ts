import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@medplum/health-gorilla-core': path.resolve('../../packages/health-gorilla-core/src'),
      '@medplum/health-gorilla-react': path.resolve('../../packages/health-gorilla-react/src'),
    },
  },
});
