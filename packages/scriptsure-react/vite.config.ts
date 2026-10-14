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
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '75%',
    globals: true,
    environment: 'jsdom',
    // Node 25+ defines a global localStorage that hides jsdom's under Vitest 4 (vitest-dev/vitest#10867)
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: './src/test.setup.ts',
    pool: 'threads',
  },
});
