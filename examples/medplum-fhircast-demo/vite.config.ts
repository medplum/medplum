// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

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
});
