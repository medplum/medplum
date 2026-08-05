// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { medplumAliases } from './aliases.mjs';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    projects: [
      'packages/*/vite{,st}.config.ts',
      // app keeps dev (vite.config.ts) and test (vitest.config.ts) configs separate
      '!packages/app/vite.config.ts',
      'examples/*/vite{,st}.config.ts',
    ],
  },
});
