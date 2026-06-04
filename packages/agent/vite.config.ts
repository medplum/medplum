// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test.setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 5_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
