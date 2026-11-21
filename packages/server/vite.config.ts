// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { TestSpecification } from 'vitest/node';
import { BaseSequencer } from 'vitest/node';
import packageJson from './package.json' with { type: 'json' };

const serverDir = dirname(fileURLToPath(import.meta.url));

// These files run after everything else, one file at a time:
// - The booking tests book Slots in SERIALIZABLE transactions, which abort with 40001 when another
//   file books at the same time.
// - The user-heavy tests invite many users. Each invite runs conditionalCreate on User and the
//   profile resource in SERIALIZABLE transactions, which can fail all of their retries under load
//   (see #11473).
const serialTestFiles = [
  'src/fhir/operations/book.recurring.int.test.ts',
  'src/fhir/operations/book.int.test.ts',
  'src/fhir/operations/cancel.int.test.ts',
  'src/fhir/operations/confirm.int.test.ts',
  'src/fhir/operations/hold.int.test.ts',
  'src/fhir/operations/reschedule.int.test.ts',

  // User-heavy tests (10+ invites per file)
  'src/admin/invite.int.test.ts',
  'src/admin/project.int.test.ts',
  'src/auth/mfa.int.test.ts',
  'src/fhir/accesspolicy.int.test.ts',
  'src/fhir/onbehalfof.int.test.ts',
  'src/fhir/operations/rescope.int.test.ts',
  'src/fhir/operations/update-user-email.int.test.ts',
  'src/oauth/token.int.test.ts',
];

/**
 * Runs test files in alphabetical order.
 * Vitest's default sequencer orders by failure history and file size, which breaks test isolation.
 * seed.int.test.ts is not sequenced here: it runs first, on its own, via vite.seed.config.ts.
 */
class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  define: {
    'import.meta.env.MEDPLUM_VERSION': JSON.stringify(`${packageJson.version}-test`),
  },
  resolve: {
    alias: [
      { find: /^@medplum\/([\w-]+)$/, replacement: resolve(serverDir, '../$1/src') },
      { find: '@azure/identity', replacement: resolve(serverDir, 'src/__mocks__/@azure/identity.ts') },
      { find: '@azure/keyvault-secrets', replacement: resolve(serverDir, 'src/__mocks__/@azure/keyvault-secrets.ts') },
      { find: '@azure/storage-blob', replacement: resolve(serverDir, 'src/__mocks__/@azure/storage-blob.ts') },
      {
        find: '@google-cloud/secret-manager',
        replacement: resolve(serverDir, 'src/__mocks__/@google-cloud/secret-manager.ts'),
      },
      { find: '@google-cloud/storage', replacement: resolve(serverDir, 'src/__mocks__/@google-cloud/storage.ts') },
      { find: 'hibp', replacement: resolve(serverDir, 'src/__mocks__/hibp.ts') },
    ],
  },
  test: {
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '75%',
    globals: true,
    environment: 'node',
    // Jest used a single `testTimeout` for both tests and lifecycle hooks (beforeAll, afterAll, etc.).
    // Vitest splits these into `testTimeout` and `hookTimeout`, so both must be set explicitly.
    // Jest config: testTimeout 30_000; `test:seed` overrode it to 400_000 for tests and hooks alike.
    // `test:seed` still passes `--testTimeout=400000` for the test body; hookTimeout here covers the
    // long-running seed.int.test.ts beforeAll (migrations, index config, vacuum).
    testTimeout: 30_000,
    hookTimeout: 400_000,
    sequence: {
      sequencer: CustomSequencer,
    },
    projects: [
      {
        // Pure unit tests: no Postgres/Redis, so no global setup.
        extends: true,
        test: {
          name: '@medplum/server-unit',
          pool: 'threads',
          // The guard must load before test.setup.ts, so setupFiles is per-project rather than inherited
          setupFiles: ['./src/test.unit-guard.ts', './src/test.setup.ts'],
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        // Integration tests that need Postgres/Redis.
        extends: true,
        test: {
          name: '@medplum/server',
          setupFiles: ['./src/test.setup.ts'],
          globalSetup: ['./src/test.global-setup.ts'],
          include: ['src/**/*.int.test.ts'],
          // seed.int.test.ts runs on its own first, via vite.seed.config.ts
          exclude: ['src/seed.int.test.ts', ...serialTestFiles],
        },
      },
      {
        extends: true,
        test: {
          name: '@medplum/server-serial',
          setupFiles: ['./src/test.setup.ts'],
          globalSetup: ['./src/test.global-setup.ts'],
          include: serialTestFiles,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['json', 'text'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__mocks__/**',
        'src/migrations/migrate-main.ts',
        'src/migrations/schema/**',
        'src/migrations/data/**',
      ],
    },
  },
});
