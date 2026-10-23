// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@medplum\/([\w-]+)$/, replacement: resolve(import.meta.dirname, '../$1/src') }],
  },
  test: {
    name: '@medplum/dosespot-react',
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '75%',
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    pool: 'threads',
  },
});
