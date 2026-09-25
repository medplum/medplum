// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../aliases.mjs';
import { jsdomExecArgv } from '../../vitest.config';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/fhir-router',
    globals: true,
    environment: 'jsdom',
    execArgv: jsdomExecArgv,
    testTimeout: 120_000,
    pool: 'threads',
  },
});
