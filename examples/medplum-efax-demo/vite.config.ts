// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

dns.setDefaultResultOrder('verbatim');

const envDefaultsPath = path.join(__dirname, '.env.defaults');
const envPath = path.join(__dirname, '.env');

if (!existsSync(envPath) && existsSync(envDefaultsPath)) {
  copyFileSync(envDefaultsPath, envPath);
}

// https://vitejs.dev/config/
export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_'],
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
  },
});
