// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig as defineVitestConfig } from 'vitest/config';
import { medplumAliases } from '../../aliases.mjs';
import { jsdomExecArgv } from '../../vitest.config';

const vitestConfig = defineVitestConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/health-gorilla-react',
    globals: true,
    environment: 'jsdom',
    execArgv: jsdomExecArgv,
    setupFiles: ['./src/test.setup.ts'],
    pool: 'threads',
  },
});

export default vitestConfig;
