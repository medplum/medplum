// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packagesDir = resolve(import.meta.dirname, 'packages');

/**
 * Resolve to the submodules for much easier testing.
 *
 * A package is aliased when it has a `src/index.ts` entry point. That excludes the apps and
 * tooling packages (app, docs, graphiql, storybook, eslint-config, fhirtypes), which have no
 * source entry point to alias to.
 */
export const medplumAliases = Object.fromEntries(
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'src', 'index.ts')))
    .map((entry) => {
      const packageDir = join(packagesDir, entry.name);
      const { name } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
      return [name, join(packageDir, 'src')];
    })
    .sort(([a], [b]) => a.localeCompare(b))
);

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    projects: [
      'packages/*/vite{,st}.config.{ts,mts}',
      // app keeps dev (vite.config.ts) and test (vitest.config.ts) configs separate
      '!packages/app/vite.config.ts',
      'examples/*/vite{,st}.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
    },
  },
});
