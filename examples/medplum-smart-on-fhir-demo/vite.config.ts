// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import { defineConfig } from 'vite';
import { medplumAliases } from '../../vitest.config';

dns.setDefaultResultOrder('verbatim');

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 8001,
  },
});
