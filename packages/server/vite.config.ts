// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { TestSpecification } from 'vitest/node';
import { BaseSequencer } from 'vitest/node';
import { medplumAliases } from '../../aliases.mjs';
import packageJson from './package.json' with { type: 'json' };

const serverDir = dirname(fileURLToPath(import.meta.url));

// These files book Slots in SERIALIZABLE transactions, which abort with 40001 when another file
// books at the same time. They run after everything else, one file at a time.
const serialTestFiles = [
  'src/fhir/operations/book.recurring.test.ts',
  'src/fhir/operations/book.test.ts',
  'src/fhir/operations/cancel.test.ts',
  'src/fhir/operations/confirm.test.ts',
  'src/fhir/operations/hold.test.ts',
  'src/fhir/operations/reschedule.test.ts',
];

/**
 * Matches the Jest custom sequencer: run seed.test.ts first, then alphabetical order.
 * Vitest's default sequencer orders by failure history and file size, which breaks test isolation.
 */
class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => {
      const aPath = a.moduleId;
      const bPath = b.moduleId;
      if (aPath.endsWith('seed.test.ts')) {
        return -1;
      }
      if (bPath.endsWith('seed.test.ts')) {
        return 1;
      }
      return aPath.localeCompare(bPath);
    });
  }
}

export default defineConfig({
  define: {
    'import.meta.env.MEDPLUM_VERSION': JSON.stringify(`${packageJson.version}-test`),
  },
  resolve: {
    alias: {
      ...medplumAliases,
      '@azure/identity': resolve(serverDir, 'src/__mocks__/@azure/identity.ts'),
      '@azure/keyvault-secrets': resolve(serverDir, 'src/__mocks__/@azure/keyvault-secrets.ts'),
      '@azure/storage-blob': resolve(serverDir, 'src/__mocks__/@azure/storage-blob.ts'),
      '@google-cloud/secret-manager': resolve(serverDir, 'src/__mocks__/@google-cloud/secret-manager.ts'),
      '@google-cloud/storage': resolve(serverDir, 'src/__mocks__/@google-cloud/storage.ts'),
      hibp: resolve(serverDir, 'src/__mocks__/hibp.ts'),
    },
  },
  test: {
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '50%',
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test.setup.ts'],
    globalSetup: ['./src/test.global-setup.ts'],
    // Jest used a single `testTimeout` for both tests and lifecycle hooks (beforeAll, afterAll, etc.).
    // Vitest splits these into `testTimeout` and `hookTimeout`, so both must be set explicitly.
    // Jest config: testTimeout 30_000; `test:seed` overrode it to 400_000 for tests and hooks alike.
    // `test:seed` still passes `--testTimeout=400000` for the test body; hookTimeout here covers the
    // long-running seed.test.ts beforeAll (migrations, index config, vacuum).
    testTimeout: 30_000,
    hookTimeout: 400_000,
    sequence: {
      sequencer: CustomSequencer,
    },
    projects: [
      {
        extends: true,
        test: {
          name: '@medplum/server',
          include: ['src/**/*.test.ts'],
          // seed.test.ts runs on its own first, via vite.seed.config.ts
          exclude: ['src/seed.test.ts', ...serialTestFiles],
        },
      },
      {
        extends: true,
        test: {
          name: '@medplum/server-serial',
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
