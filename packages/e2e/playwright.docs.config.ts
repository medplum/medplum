// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';

// Docs screenshots drive the Provider app, which the e2e webServer doesn't start; see README.md
export default defineConfig({
  testDir: './docs-screenshots',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
});
