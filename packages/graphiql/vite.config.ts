// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference types="vite/client" />
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

if (!existsSync(path.join(import.meta.dirname, '.env'))) {
  copyFileSync(path.join(import.meta.dirname, '.env.defaults'), path.join(import.meta.dirname, '.env'));
}

export default defineConfig({
  resolve: {
    alias: [{ find: /^@medplum\/([\w-]+)$/, replacement: path.resolve(import.meta.dirname, '../$1/src') }],
  },
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react()],
  server: {
    port: 8080,
  },
  build: {
    sourcemap: true,
  },
});
