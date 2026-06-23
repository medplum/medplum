// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config';

if (!existsSync(resolve(import.meta.dirname, '.env'))) {
  copyFileSync(resolve(import.meta.dirname, '.env.defaults'), resolve(import.meta.dirname, '.env'));
}

export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [
    react(),
    /*
     * Replace CSS module imports with an identity proxy (see test-mocks/cssModuleProxy.ts).
     * Jest used identity-obj-proxy for the same purpose: `styles.foo` resolves to "foo"
     * so components render without parsing or applying real CSS in jsdom.
     */
    {
      name: 'css-module-identity-proxy',
      enforce: 'pre',
      resolveId(source) {
        if (source.endsWith('.module.css')) {
          return resolve(import.meta.dirname, 'src/test-mocks/cssModuleProxy.ts');
        }
        return undefined;
      },
    },
  ],
  resolve: {
    alias: {
      ...medplumAliases,
      '@medplum/core': resolve(import.meta.dirname, '../core/src'),
      '@medplum/react': resolve(import.meta.dirname, '../react/src'),
      '@medplum/react-hooks': resolve(import.meta.dirname, '../react-hooks/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        /* Base URL for relative links and window.location in component tests. */
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./src/test.setup.ts'],
    testTimeout: 120_000,
    fakeTimers: {
      /*
       * Advance mocked timers automatically (e.g. debounced search inputs) instead of
       * requiring manual vi.advanceTimersByTime in every test.
       */
      shouldAdvanceTime: true,
    },
    /*
     * Run test files sequentially in isolated fork processes. App tests share global
     * FHIR indexes and jsdom polyfills from test.setup.ts; parallel file runs cause flaky tests
     */
    pool: 'forks',
    fileParallelism: false,
  },
});
