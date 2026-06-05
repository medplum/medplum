// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'css-module-identity-proxy',
      enforce: 'pre',
      resolveId(source) {
        if (source.endsWith('.module.css')) {
          return resolve(import.meta.dirname, 'src/test-mocks/cssModuleProxy.ts');
        }
      },
    },
  ],
  resolve: {
    alias: {
      ...medplumAliases,
      signature_pad: resolve(import.meta.dirname, 'src/test-mocks/signature_pad.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./src/test.setup.ts'],
    testTimeout: 10_000,
    fakeTimers: {
      shouldAdvanceTime: true,
    },
    pool: 'forks',
    fileParallelism: false,
  },
});
