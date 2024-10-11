import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import path from 'path';
import { defineConfig, UserConfig } from 'vite';

// Resolve aliases to local packages when working within the monorepo
const alias: NonNullable<UserConfig['resolve']>['alias'] = Object.fromEntries(
  Object.entries({
    '@medplum/health-gorilla-core': path.resolve(__dirname, '../../packages/health-gorilla-core/src'),
    '@medplum/health-gorilla-react': path.resolve(__dirname, '../../packages/health-gorilla-react/src'),
  }).filter(([, relPath]) => existsSync(relPath))
);
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias,
  },
});
