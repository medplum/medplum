// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';
import { globalSetupFiles } from '../../vitest.config';

const coreSrc = path.resolve(__dirname, '../../packages/core/src');

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

// https://vitejs.dev/config/
export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: existsSync(coreSrc) ? { '@medplum/core': coreSrc } : undefined,
  },
  test: {
    environment: 'jsdom',
    setupFiles: [...globalSetupFiles, './src/test.setup.ts'],
    globals: true,
    testTimeout: 120000,
  },
});
