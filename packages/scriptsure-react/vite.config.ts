// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../aliases.mjs';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/scriptsure-react',
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '50%',
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    pool: 'threads',
  },
});
