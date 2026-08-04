// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig as defineVitestConfig } from 'vitest/config';
import { globalSetupFiles, medplumAliases } from '../../vitest.config';

const vitestConfig = defineVitestConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [...globalSetupFiles, './src/test.setup.ts'],
    pool: 'threads',
  },
});

export default vitestConfig;
