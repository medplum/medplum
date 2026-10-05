// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './',
  testMatch: '*.screenshots.ts',
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: process.env.PROVIDER_BASE_URL ?? 'http://localhost:3001',
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'Chrome', use: { browserName: 'chromium', channel: 'chromium' } }],
  retries: 0,
  workers: 1,
};

export default config;
