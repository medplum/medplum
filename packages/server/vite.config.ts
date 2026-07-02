// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import type { TestSpecification } from 'vitest/node';
import { BaseSequencer } from 'vitest/node';
import { medplumAliases } from '../../vitest.config';
import packageJson from './package.json' with { type: 'json' };

const serverDir = dirname(fileURLToPath(import.meta.url));

/**
 * Matches the Jest custom sequencer: run seed.int.test.ts first, then alphabetical order.
 * Vitest's default sequencer orders by failure history and file size, which breaks test isolation.
 */
class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => {
      const aPath = a.moduleId;
      const bPath = b.moduleId;
      if (aPath.endsWith('seed.int.test.ts')) {
        return -1;
      }
      if (bPath.endsWith('seed.int.test.ts')) {
        return 1;
      }
      return aPath.localeCompare(bPath);
    });
  }
}

const sharedConfig = {
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
    },
  },
} as const;

const sharedTestConfig = {
  globals: true,
  environment: 'node',
  setupFiles: ['./src/test.setup.ts'],
  // Jest used a single `testTimeout` for both tests and lifecycle hooks (beforeAll, afterAll, etc.).
  // Vitest splits these into `testTimeout` and `hookTimeout`, so both must be set explicitly.
  // Jest config: testTimeout 30_000; `test:seed` overrode it to 400_000 for tests and hooks alike.
  // `test:seed` passes `--testTimeout=400000` for the test body; hookTimeout here covers the
  // long-running seed.int.test.ts beforeAll (migrations, index config, vacuum) in the seed project.
  testTimeout: 30_000,
  hookTimeout: 400_000,
} as const;

export default defineConfig({
  ...sharedConfig,
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['json', 'text'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__mocks__/**',
        'src/migrations/migrate-main.ts',
        'src/migrations/schema/**',
        'src/migrations/data/**',
      ],
    },
    projects: [
      {
        ...sharedConfig,
        test: {
          ...sharedTestConfig,
          name: 'unit',
          pool: 'threads',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts'],
        },
      },
      {
        ...sharedConfig,
        test: {
          ...sharedTestConfig,
          name: 'integration',
          pool: 'forks',
          include: ['src/**/*.int.test.ts'],
          // Seed runs separately via `test:seed` (see `seed` project). Exclude here so it is not
          // picked up when `npm run test` runs both projects without relying on CLI --exclude.
          exclude: [...configDefaults.exclude, 'src/seed.int.test.ts'],
          sequence: {
            sequencer: CustomSequencer,
          },
        },
      },
      {
        ...sharedConfig,
        test: {
          ...sharedTestConfig,
          name: 'seed',
          pool: 'forks',
          // Dedicated project for `npm run test:seed`; must be separate because project-level
          // exclude blocks CLI file filters on the integration project.
          include: ['src/seed.int.test.ts'],
        },
      },
    ],
  },
});
