// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { existsSync } from 'fs';
import path from 'path';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vitest/config';

dns.setDefaultResultOrder('verbatim');

// Resolve aliases to local packages when working within the monorepo
const alias: NonNullable<UserConfig['resolve']>['alias'] = [
  { find: '@medplum/react/styles.css', replacement: path.resolve(__dirname, '../../packages/react/dist/esm/index.css') },
  { find: '@medplum/react', replacement: path.resolve(__dirname, '../../packages/react/src/index.ts') },
  { find: '@medplum/core', replacement: path.resolve(__dirname, '../../packages/core/src/index.ts') },
  { find: '@medplum/react-hooks', replacement: path.resolve(__dirname, '../../packages/react-hooks/src/index.ts') },
  { find: '@medplum/dosespot-react', replacement: path.resolve(__dirname, '../../packages/dosespot-react/src/index.ts') },
  { find: '@medplum/health-gorilla-core', replacement: path.resolve(__dirname, '../../packages/health-gorilla-core/src/index.ts') },
  { find: '@medplum/health-gorilla-react', replacement: path.resolve(__dirname, '../../packages/health-gorilla-react/src/index.ts') },
].filter(({ replacement }) => existsSync(replacement));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
  },
  preview: {
    host: 'localhost',
    port: 3000,
  },
  resolve: {
    alias,
  },
  optimizeDeps: {
    exclude: ['@medplum/core', '@medplum/react', '@medplum/react-hooks'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
  },
});
