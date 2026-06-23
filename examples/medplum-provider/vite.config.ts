// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vitest/config';

dns.setDefaultResultOrder('verbatim');

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

// Resolve aliases to local packages when working within the monorepo
const alias: NonNullable<UserConfig['resolve']>['alias'] = Object.fromEntries(
  Object.entries({
    '@medplum/core': path.resolve(__dirname, '../../packages/core/src'),
    '@medplum/dosespot-react': path.resolve(__dirname, '../../packages/dosespot-react/src'),
    '@medplum/scriptsure-react': path.resolve(__dirname, '../../packages/scriptsure-react/src'),
    '@medplum/react$': path.resolve(__dirname, '../../packages/react/src'),
    '@medplum/react/styles.css': path.resolve(__dirname, '../../packages/react/dist/esm/index.css'),
    '@medplum/react-hooks': path.resolve(__dirname, '../../packages/react-hooks/src'),
    '@medplum/health-gorilla-core': path.resolve(__dirname, '../../packages/health-gorilla-core/src'),
    '@medplum/health-gorilla-react': path.resolve(__dirname, '../../packages/health-gorilla-react/src'),
  }).filter(([, relPath]) => existsSync(relPath))
);

// https://vitejs.dev/config/
export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3001,
  },
  preview: {
    host: 'localhost',
    port: 3001,
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
