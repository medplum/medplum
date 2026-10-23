// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { defineConfig as defineVitestConfig } from 'vitest/config';

const vitestConfig = defineVitestConfig({
  resolve: {
    alias: [{ find: /^@medplum\/([\w-]+)$/, replacement: resolve(import.meta.dirname, '../$1/src') }],
  },
  test: {
    name: '@medplum/health-gorilla-react',
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '75%',
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    pool: 'threads',
  },
});

export default vitestConfig;
