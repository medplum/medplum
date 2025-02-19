import react from '@vitejs/plugin-react';
import dns from 'dns';
import { existsSync } from 'fs';
import path from 'path';
import { defineConfig, UserConfig } from 'vite';

dns.setDefaultResultOrder('verbatim');

// Resolve aliases to local packages when working within the monorepo
const alias: NonNullable<UserConfig['resolve']>['alias'] = Object.fromEntries(
  Object.entries({
    '@medplum/core': path.resolve(__dirname, '../../packages/core/src'),
    '@medplum/dosespot-react': path.resolve(__dirname, '../../packages/dosespot-react/src'),
    '@medplum/react': path.resolve(__dirname, '../../packages/react/src'),
  }).filter(([, relPath]) => existsSync(relPath))
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
  },
  resolve: {
    alias,
  },
});
