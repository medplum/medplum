// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

// Node 26 enables experimental Web Storage by default. That global can prevent
// jsdom from installing Storage. The flag is a no-op on Node 22/24 (already off).
export const jsdomExecArgv = ['--no-experimental-webstorage'];

export default defineConfig({
  test: {
    execArgv: jsdomExecArgv,
    projects: [
      'packages/*/vite{,st}.config.ts',
      // app keeps dev (vite.config.ts) and test (vitest.config.ts) configs separate
      '!packages/app/vite.config.ts',
      'examples/*/vite{,st}.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
    },
  },
});
