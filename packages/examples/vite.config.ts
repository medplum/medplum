// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../aliases.mjs';

export default defineConfig({
  resolve: { alias: medplumAliases },
  test: {
    name: '@medplum/examples',
    environment: 'node',
    pool: 'threads',
    include: ['src/**/*.test.ts'],
  },
});
