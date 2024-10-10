import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import path from 'path';
import { defineConfig, UserConfig } from 'vite';

// Resolve aliases to local packages when working within the monorepo
const alias: NonNullable<UserConfig['resolve']>['alias'] = Object.fromEntries(
  Object.entries({
    '@medplum/react': '../../packages/react/src',
    '@medplum/health-gorilla-core': '../../packages/health-gorilla-core/src',
    '@medplum/health-gorilla-react': '../../packages/health-gorilla-react/src',
  }).filter(([, relPath]) => existsSync(path.resolve(__dirname, relPath)))
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
