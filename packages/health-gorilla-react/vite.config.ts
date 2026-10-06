// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig as defineVitestConfig } from 'vitest/config';
import { medplumAliases } from '../../aliases.mjs';

const vitestConfig = defineVitestConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/health-gorilla-react',
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '50%',
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    pool: 'threads',
  },
});

export default vitestConfig;
