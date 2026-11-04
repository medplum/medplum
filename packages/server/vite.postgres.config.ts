// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const serverDir = dirname(fileURLToPath(import.meta.url));

// Deliberately omit the server's global setup: it mocks BullMQ and requires a seeded FHIR database.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@medplum\/([\w-]+)$/, replacement: resolve(serverDir, '../$1/src') }],
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/workers/backend-config.test.ts',
      'src/workers/backend.test.ts',
      'src/workers/backend.postgres.integration.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
