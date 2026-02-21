// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { existsSync } from 'fs';
import path from 'path';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vitest/config';

dns.setDefaultResultOrder('verbatim');

// Resolve aliases to local packages when working within the monorepo.
// Use array form so @medplum/react is resolved to source (dist may be stale and missing exports).
const alias: NonNullable<UserConfig['resolve']>['alias'] = [
  { find: /^@medplum\/react$/, replacement: path.resolve(__dirname, '../../packages/react/src') },
  ...Object.entries({
    '@medplum/core': path.resolve(__dirname, '../../packages/core/src'),
    '@medplum/dosespot-core': path.resolve(__dirname, '../../packages/dosespot-core/src'),
    '@medplum/dosespot-react': path.resolve(__dirname, '../../packages/dosespot-react/src'),
    '@medplum/react/styles.css': path.resolve(__dirname, '../../packages/react/dist/esm/index.css'),
    '@medplum/react-hooks': path.resolve(__dirname, '../../packages/react-hooks/src'),
    '@medplum/health-gorilla-core': path.resolve(__dirname, '../../packages/health-gorilla-core/src'),
    '@medplum/health-gorilla-react': path.resolve(__dirname, '../../packages/health-gorilla-react/src'),
    'react-live': path.resolve(__dirname, '../../node_modules/react-live'),
  })
    .filter(([, relPath]) => !relPath.includes('node_modules') || existsSync(relPath))
    .map(([find, replacement]) => ({ find, replacement })),
];

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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
  },
});
