// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  plugins: [react()],
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test.setup.ts'],
    globals: true,
    testTimeout: 120000,
  },
});
