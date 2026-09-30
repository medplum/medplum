// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { timingReporterPlugin } from './src/test.timing-reporter';
import baseConfig from './vite.config.ts';

/**
 * Config for `npm run test:seed`.
 */
export default defineConfig({
  ...baseConfig,
  // Separate file so the seed run does not overwrite the main run's timings
  plugins: [timingReporterPlugin('timing-seed.ndjson')],
  test: {
    ...baseConfig.test,
    globalSetup: [], // Skip global setup until DB is seeded
    include: ['src/seed.test.ts'],
  },
});
