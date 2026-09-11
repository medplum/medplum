// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';
import { jsdomExecArgv } from '../../vitest.config';

const coreSrc = path.resolve(__dirname, '../../packages/core/src');

if (!existsSync(path.join(import.meta.dirname, '.env'))) {
  copyFileSync(path.join(import.meta.dirname, '.env.defaults'), path.join(import.meta.dirname, '.env'));
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
    execArgv: jsdomExecArgv,
    setupFiles: ['./src/test.setup.ts'],
    globals: true,
    testTimeout: 120000,
  },
});
