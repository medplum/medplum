// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*/vite{,st}.config.ts',
      // app keeps dev (vite.config.ts) and test (vitest.config.ts) configs separate
      '!packages/app/vite.config.ts',
      'examples/*/vite{,st}.config.ts',
      // Nested projects aren't expanded here, so they are named for --merge-reports
      { test: { name: '@medplum/core-node', root: 'packages/core', include: [] } },
      { test: { name: '@medplum/server-serial', root: 'packages/server', include: [] } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
    },
  },
});
