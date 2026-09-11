// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vitest/config';

dns.setDefaultResultOrder('verbatim');

if (!existsSync(path.join(import.meta.dirname, '.env'))) {
  copyFileSync(path.join(import.meta.dirname, '.env.defaults'), path.join(import.meta.dirname, '.env'));
}

// Resolve aliases to local packages when working within the monorepo
const alias: NonNullable<UserConfig['resolve']>['alias'] = Object.fromEntries(
  Object.entries({
    '@medplum/core': path.resolve(import.meta.dirname, '../../packages/core/src'),
    '@medplum/dosespot-react': path.resolve(import.meta.dirname, '../../packages/dosespot-react/src'),
    '@medplum/scriptsure-react': path.resolve(import.meta.dirname, '../../packages/scriptsure-react/src'),
    '@medplum/react': path.resolve(import.meta.dirname, '../../packages/react/src'),
    '@medplum/react-scheduling': path.resolve(import.meta.dirname, '../../packages/react-scheduling/src'),
    '@medplum/react-hooks': path.resolve(import.meta.dirname, '../../packages/react-hooks/src'),
    '@medplum/health-gorilla-core': path.resolve(import.meta.dirname, '../../packages/health-gorilla-core/src'),
    '@medplum/health-gorilla-react': path.resolve(import.meta.dirname, '../../packages/health-gorilla-react/src'),
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
    server: {
      deps: {
        // react-router v8 is ESM-only, so Vitest externalizes it and its export
        // namespace is frozen. Inlining routes it through Vite's transform,
        // which restores `vi.spyOn(reactRouter, ...)` in tests.
        inline: ['react-router'],
      },
    },
  },
});
