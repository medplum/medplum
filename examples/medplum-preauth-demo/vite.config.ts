// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

dns.setDefaultResultOrder('verbatim');

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

export default defineConfig({
  // Only the variables the app reads (src/config.ts). A broad MEDPLUM_ prefix would also expose
  // MEDPLUM_CLIENT_SECRET, which the dev server serves to the browser.
  envPrefix: ['MEDPLUM_CLIENT_ID', 'MEDPLUM_BOT_ID', 'GOOGLE_CLIENT_ID'],
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
  },
});
