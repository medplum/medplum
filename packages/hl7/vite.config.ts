// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../aliases.mjs';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/hl7',
    globals: true,
    environment: 'node',
    testTimeout: 120_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
