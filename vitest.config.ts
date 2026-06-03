// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export const medplumAliases = {
  '@medplum/core': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
  '@medplum/fhir-router': fileURLToPath(new URL('./packages/fhir-router/src', import.meta.url)),
  '@medplum/mock': fileURLToPath(new URL('./packages/mock/src', import.meta.url)),
};

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    projects: ['packages/*/vite{,st}.config.ts', 'examples/*/vite{,st}.config.ts'],
  },
});
