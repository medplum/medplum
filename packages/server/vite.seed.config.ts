// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import baseConfig from './vite.config';

/**
 * Config for `npm run test:seed`.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globalSetup: [], // Skip global setup until DB is seeded
    include: ['src/seed.test.ts'],
  },
});
