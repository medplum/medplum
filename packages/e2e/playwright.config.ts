// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CA_CERT_PATH, ensureTestCertificates } from './fixtures/certs';
import { APP_URL, SERVER_URL } from './fixtures/urls';

await ensureTestCertificates();

const LOG_DIR = join(import.meta.dirname, 'logs');
mkdirSync(LOG_DIR, { recursive: true });

const SERVER_CONFIG = 'file:medplum.config.json,file:../e2e/medplum.e2e.config.json';

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Tests are independent, so a failure is a real failure: no retries
  retries: 0,
  workers: 4,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testDir: './api' },
    { name: 'ui', testDir: './ui', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      name: 'server',
      command: `npm start -- ${SERVER_CONFIG} > "${join(LOG_DIR, 'server.log')}"`,
      cwd: '../server',
      url: `${SERVER_URL}healthcheck`,
      env: { NODE_EXTRA_CA_CERTS: CA_CERT_PATH },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      name: 'app',
      command: 'npm run preview',
      cwd: '../app',
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
