// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*/vite{,st}.config.ts',
      // app keeps dev (vite.config.ts) and test (vitest.config.ts) configs separate
      '!packages/app/vite.config.ts',
      // core and server declare nested projects, which this config would expand and rename to
      // "<package> (<project>)". Name them as each package's own run does, for --merge-reports.
      '!packages/core/vite.config.ts',
      '!packages/server/vite.config.ts',
      'examples/*/vite{,st}.config.ts',
      { test: { name: '@medplum/core', root: 'packages/core', include: [] } },
      { test: { name: '@medplum/core-node', root: 'packages/core', include: [] } },
      { test: { name: '@medplum/server', root: 'packages/server', include: [] } },
      { test: { name: '@medplum/server-serial', root: 'packages/server', include: [] } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
    },
  },
});
