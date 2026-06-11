// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config';
import packageJson from './package.json' with { type: 'json' };
import CustomSequencer from './vitest.sequencer';

const serverDir = dirname(fileURLToPath(import.meta.url));

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
    },
  },
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: ['pg'],
      },
    },
    setupFiles: ['./src/test.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    sequence: {
      sequencer: CustomSequencer,
    },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['json', 'text'],
      reportsDirectory: 'coverage',
      include: ['src/**/*'],
      exclude: [
        'src/__mocks__/**',
        'src/migrations/migrate-main.ts',
        'src/migrations/schema/**',
        'src/migrations/data/**',
      ],
    },
  },
});
